import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import crypto from 'node:crypto';

// HMAC-SHA256 sign for Binance
function signRequest(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(new URLSearchParams(payload).toString())
    .digest('hex');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch bot config + active API key
    const configs = await base44.asServiceRole.entities.BotConfig.list();
    const botConfig = configs[0];

    if (!botConfig || !botConfig.enabled) {
      console.log('[OPEN-BOT] Bot disabled, skipping');
      return Response.json({ message: 'Bot disabled', trades_opened: 0 });
    }

    // Get user's API keys
    const apiKeys = await base44.asServiceRole.entities.UserApiKey.filter({
      created_by: user.email,
      is_active: true
    });

    if (!apiKeys.length) {
      console.log('[OPEN-BOT] No API keys found');
      return Response.json({ message: 'No API keys configured', trades_opened: 0 });
    }

    const apiKey = apiKeys[0];

    // Decrypt API secrets via backend function
    let apiSecret, apiPassphrase;
    try {
      const decryptRes = await base44.asServiceRole.functions.invoke('decryptApiSecret', {
        keyId: apiKey.id
      });
      apiSecret = decryptRes.data.secret;
      apiPassphrase = decryptRes.data.passphrase;
    } catch (e) {
      console.log('[OPEN-BOT] Failed to decrypt secret:', e.message);
      return Response.json({ error: 'Failed to decrypt API secret' }, { status: 500 });
    }

    // Get top pump signals (scanner results)
    const pumpPairs = await base44.asServiceRole.entities.Watchlist.filter({
      created_by: user.email
    }, '-updated_date', 20);

    if (!pumpPairs.length) {
      console.log('[OPEN-BOT] No watchlist pairs');
      return Response.json({ message: 'No watchlist pairs', trades_opened: 0 });
    }

    // Check existing open trades
    const openTrades = await base44.asServiceRole.entities.LiveTrade.filter({
      created_by: user.email,
      status: 'open'
    });

    const openSymbols = new Set(openTrades.map(t => t.symbol));

    // Risk params
    const maxOpenTrades = botConfig.maxOpenTrades || 5;
    const tradeSize = botConfig.tradeSize || 200;
    const sl = botConfig.stopLossPct || 5;
    const tp = botConfig.takeProfitPct || 30;

    if (openTrades.length >= maxOpenTrades) {
      console.log(`[OPEN-BOT] Max open trades (${maxOpenTrades}) reached`);
      return Response.json({
        message: `Max trades (${maxOpenTrades}) reached`,
        trades_opened: 0
      });
    }

    const trades_opened = [];

    // Process pump signals for entries
    for (const pair of pumpPairs) {
      if (openSymbols.has(pair.symbol)) {
        console.log(`[OPEN-BOT] ${pair.symbol} already open, skip`);
        continue;
      }

      if (trades_opened.length >= (maxOpenTrades - openTrades.length)) {
        console.log('[OPEN-BOT] Hit trade limit for this run');
        break;
      }

      // Get current price from KuCoin
      let priceData;
      try {
        const res = await fetch(
          `https://api-futures.kucoin.com/api/v1/ticker?symbol=${pair.symbol}`,
          { headers: { 'Accept': 'application/json' } }
        );
        const json = await res.json();
        priceData = json.data;
      } catch (e) {
        console.log(`[OPEN-BOT] Failed to get price for ${pair.symbol}`);
        continue;
      }

      const entryPrice = parseFloat(priceData?.price || priceData?.lastTradePrice);
      if (!entryPrice) {
        console.log(`[OPEN-BOT] Invalid price for ${pair.symbol}`);
        continue;
      }

      // Calculate SL/TP
      const slPrice = entryPrice * (1 - sl / 100);
      const tpPrice = entryPrice * (1 + tp / 100);

      // Calculate quantity from USDT size
      const quantity = parseFloat((tradeSize / entryPrice).toFixed(3));

      console.log(`[OPEN-BOT] Opening ${pair.symbol} @ ${entryPrice} qty=${quantity}`);

      // Create market order via KuCoin API
      const clientOid = `AUTO-${Date.now()}-BUY`;

      try {
        const orderRes = await fetch('https://api-futures.kucoin.com/api/v1/orders', {
          method: 'POST',
          headers: {
            'KC-API-KEY': apiKey.api_key,
            'KC-API-SECRET': apiSecret,
            'KC-API-PASSPHRASE': apiPassphrase,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            symbol: pair.symbol,
            side: 'buy',
            type: 'market',
            size: quantity,
            clientOid: clientOid
          })
        });

        if (!orderRes.ok) {
          const error = await orderRes.json();
          console.log(`[OPEN-BOT] Order failed: ${error.msg}`);
          continue;
        }

        const order = await orderRes.json();
        const kucoinOrderId = order.data?.orderId;

        // Set SL order via KuCoin
        const slRes = await fetch('https://api-futures.kucoin.com/api/v1/orders', {
          method: 'POST',
          headers: {
            'KC-API-KEY': apiKey.api_key,
            'KC-API-SECRET': apiSecret,
            'KC-API-PASSPHRASE': apiPassphrase,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            symbol: pair.symbol,
            side: 'sell',
            type: 'stop',
            stopPrice: slPrice.toString(),
            size: quantity,
            clientOid: `AUTO-${Date.now()}-SL`
          })
        });

        const slOrder = slRes.ok ? await slRes.json() : null;
        const slOrderId = slOrder?.data?.orderId;

        // Set TP order via KuCoin
        const tpRes = await fetch('https://api-futures.kucoin.com/api/v1/orders', {
          method: 'POST',
          headers: {
            'KC-API-KEY': apiKey.api_key,
            'KC-API-SECRET': apiSecret,
            'KC-API-PASSPHRASE': apiPassphrase,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            symbol: pair.symbol,
            side: 'sell',
            type: 'limit',
            price: tpPrice.toString(),
            size: quantity,
            clientOid: `AUTO-${Date.now()}-TP`
          })
        });

        const tpOrder = tpRes.ok ? await tpRes.json() : null;
        const tpOrderId = tpOrder?.data?.orderId;

        // Log trade to DB
        await base44.asServiceRole.entities.LiveTrade.create({
          symbol: pair.symbol,
          side: 'BUY',
          status: 'open',
          market_type: 'futures',
          entry_price: entryPrice,
          quantity: quantity,
          notional_usd: tradeSize,
          stop_loss: slPrice,
          take_profit: tpPrice,
          binance_order_id: kucoinOrderId?.toString(),
          sl_order_id: slOrderId?.toString(),
          tp_order_id: tpOrderId?.toString(),
          created_by: user.email,
          notes: `Auto-opened by bot | SL:${slPrice.toFixed(8)} | TP:${tpPrice.toFixed(8)}`
        });

        trades_opened.push({
          symbol: pair.symbol,
          entry: entryPrice,
          sl: slPrice,
          tp: tpPrice,
          qty: quantity
        });

        console.log(`[OPEN-BOT] ✓ ${pair.symbol} opened | SL:${slPrice.toFixed(8)} | TP:${tpPrice.toFixed(8)}`);
      } catch (e) {
        console.log(`[OPEN-BOT] Failed to open ${pair.symbol}:`, e.message);
      }
    }

    return Response.json({
      message: `Opened ${trades_opened.length} trades`,
      trades_opened: trades_opened,
      next_run: 'Check monitorLiveOrders for exits'
    });
  } catch (error) {
    console.error('[OPEN-BOT] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});