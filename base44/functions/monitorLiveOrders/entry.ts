import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}



Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all open trades for this user
    const openTrades = await base44.entities.LiveTrade.filter(
      { created_by: user.email, status: 'open' },
      '-created_date',
      100
    );

    if (openTrades.length === 0) {
      return Response.json({ processed: 0, closed: [] });
    }

    // Get API key for this user
    const apiKeys = await base44.entities.UserApiKey.filter(
      { created_by: user.email, is_active: true },
      '-created_date',
      1
    );

    if (apiKeys.length === 0) {
      return Response.json({ error: 'No API key found' }, { status: 400 });
    }

    const apiKey = apiKeys[0];
    const closedTrades = [];

    // Monitor each open trade
    for (const trade of openTrades) {
      try {
        // Get current price
        const ticker = await base44.functions.invoke('binanceApi', {
          action: 'getTickerPrice',
          keyId: apiKey.id,
          params: { symbol: trade.symbol }
        });
        const currentPrice = parseFloat(ticker.price);

        let shouldClose = false;
        let exitPrice = null;
        let exitReason = '';
        let pnlPercent = 0;
        let pnlUsd = 0;

        // Calculate P&L
        if (trade.side === 'BUY') {
          pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
          pnlUsd = (currentPrice - trade.entry_price) * trade.quantity;
          
          // Check TP1 (2%)
          if (trade.take_profit && currentPrice >= trade.take_profit) {
            shouldClose = true;
            exitPrice = currentPrice;
            exitReason = 'take_profit';
          }
          // Check SL
          else if (trade.stop_loss && currentPrice <= trade.stop_loss) {
            shouldClose = true;
            exitPrice = currentPrice;
            exitReason = 'stop_loss';
          }
        } else if (trade.side === 'SELL') {
          pnlPercent = ((trade.entry_price - currentPrice) / trade.entry_price) * 100;
          pnlUsd = (trade.entry_price - currentPrice) * trade.quantity;
          
          // Check TP1 (2%)
          if (trade.take_profit && currentPrice <= trade.take_profit) {
            shouldClose = true;
            exitPrice = currentPrice;
            exitReason = 'take_profit';
          }
          // Check SL
          else if (trade.stop_loss && currentPrice >= trade.stop_loss) {
            shouldClose = true;
            exitPrice = currentPrice;
            exitReason = 'stop_loss';
          }
        }

        if (shouldClose && trade.binance_order_id) {
          // Place market close order
          try {
            await base44.functions.invoke('binanceApi', {
              action: 'placeOrder',
              keyId: apiKey.id,
              params: {
                symbol: trade.symbol,
                side: trade.side === 'BUY' ? 'SELL' : 'BUY',
                type: 'MARKET',
                quantity: trade.quantity.toString()
              }
            });

            // Update trade record
            await base44.entities.LiveTrade.update(trade.id, {
              status: 'closed',
              exit_price: exitPrice,
              exit_reason: exitReason,
              pnl_percent: parseFloat(pnlPercent.toFixed(2)),
              pnl_usd: parseFloat(pnlUsd.toFixed(2))
            });

            closedTrades.push({
              symbol: trade.symbol,
              exitReason: exitReason,
              pnl: pnlPercent.toFixed(2)
            });
          } catch (closeError) {
            console.error(`Error closing ${trade.symbol}:`, closeError.message);
          }
        } else {
          // Update P&L even if not closing
          await base44.entities.LiveTrade.update(trade.id, {
            pnl_percent: parseFloat(pnlPercent.toFixed(2)),
            pnl_usd: parseFloat(pnlUsd.toFixed(2))
          });
        }
      } catch (tradeError) {
        console.error(`Error processing trade ${trade.symbol}:`, tradeError.message);
      }
    }

    return Response.json({
      processed: openTrades.length,
      closed: closedTrades.length,
      details: closedTrades
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});