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
    
    // Allow both scheduled (no user) and manual calls (with user)
    let user;
    try {
      user = await base44.auth.me();
    } catch (_) {
      // Scheduled call - use service role
    }

    // Get all open trades (service role for scheduled, user filter for manual)
    let openTrades;
    if (user) {
      openTrades = await base44.asServiceRole.entities.LiveTrade.filter(
        { created_by: user.email, status: 'open' },
        '-created_date',
        100
      );
    } else {
      // Scheduled - get ALL open trades from all users
      openTrades = await base44.asServiceRole.entities.LiveTrade.filter(
        { status: 'open' },
        '-created_date',
        500
      );
    }

    if (openTrades.length === 0) {
      console.log('[MONITOR] No open trades to process');
      return Response.json({ processed: 0, closed: [] });
    }

    const closedTrades = [];

    // Monitor each open trade
    for (const trade of openTrades) {
      try {
        // Get current price from KuCoin (public API, no auth needed)
        let currentPrice;
        try {
          const res = await fetch(`https://api-futures.kucoin.com/api/v1/ticker?symbol=${trade.symbol}`);
          const data = await res.json();
          currentPrice = parseFloat(data.data?.price || data.data?.lastTradePrice);
        } catch (e) {
          console.log(`[MONITOR] Failed to get price for ${trade.symbol}:`, e.message);
          continue;
        }

        if (!currentPrice) {
          console.log(`[MONITOR] Invalid price for ${trade.symbol}`);
          continue;
        }

        let shouldClose = false;
        let exitPrice = null;
        let exitReason = '';
        let pnlPercent = 0;
        let pnlUsd = 0;

        // Calculate P&L
        if (trade.side === 'BUY') {
          pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
          pnlUsd = (currentPrice - trade.entry_price) * trade.quantity;
          
          // Check TP
          if (trade.take_profit && currentPrice >= trade.take_profit) {
            shouldClose = true;
            exitPrice = currentPrice;
            exitReason = 'take_profit';
            console.log(`[MONITOR] ${trade.symbol} HIT TP @ ${currentPrice}`);
          }
          // Check SL
          else if (trade.stop_loss && currentPrice <= trade.stop_loss) {
            shouldClose = true;
            exitPrice = currentPrice;
            exitReason = 'stop_loss';
            console.log(`[MONITOR] ${trade.symbol} HIT SL @ ${currentPrice}`);
          }
        } else if (trade.side === 'SELL') {
          pnlPercent = ((trade.entry_price - currentPrice) / trade.entry_price) * 100;
          pnlUsd = (trade.entry_price - currentPrice) * trade.quantity;
          
          // Check TP
          if (trade.take_profit && currentPrice <= trade.take_profit) {
            shouldClose = true;
            exitPrice = currentPrice;
            exitReason = 'take_profit';
            console.log(`[MONITOR] ${trade.symbol} HIT TP @ ${currentPrice}`);
          }
          // Check SL
          else if (trade.stop_loss && currentPrice >= trade.stop_loss) {
            shouldClose = true;
            exitPrice = currentPrice;
            exitReason = 'stop_loss';
            console.log(`[MONITOR] ${trade.symbol} HIT SL @ ${currentPrice}`);
          }
        }

        if (shouldClose) {
          // Get API key for closing order (if user-initiated)
          if (user) {
            const apiKeys = await base44.asServiceRole.entities.UserApiKey.filter(
              { created_by: user.email, is_active: true }
            );

            if (apiKeys.length > 0) {
              const apiKey = apiKeys[0];
              const decrypted = await base44.asServiceRole.functions.invoke('decryptApiSecret', { keyId: apiKey.id });
              const apiSecret = decrypted.data.secret;
              const apiPassphrase = decrypted.data.passphrase;

              // Place close order via KuCoin
              try {
                await fetch('https://api-futures.kucoin.com/api/v1/orders', {
                  method: 'POST',
                  headers: {
                    'KC-API-KEY': apiKey.api_key,
                    'KC-API-SECRET': apiSecret,
                    'KC-API-PASSPHRASE': apiPassphrase,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    symbol: trade.symbol,
                    side: trade.side === 'BUY' ? 'sell' : 'buy',
                    type: 'market',
                    size: trade.quantity,
                    clientOid: `CLOSE-${trade.id}`
                  })
                });
              } catch (orderErr) {
                console.log(`[MONITOR] Failed to close ${trade.symbol}:`, orderErr.message);
              }
            }
          }

          // Update trade record
          await base44.asServiceRole.entities.LiveTrade.update(trade.id, {
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
        } else {
          // Update P&L even if not closing
          await base44.asServiceRole.entities.LiveTrade.update(trade.id, {
            pnl_percent: parseFloat(pnlPercent.toFixed(2)),
            pnl_usd: parseFloat(pnlUsd.toFixed(2))
          });
        }
      } catch (tradeError) {
        console.error(`[MONITOR] Error processing ${trade.symbol}:`, tradeError.message);
      }
    }

    console.log(`[MONITOR] Processed ${openTrades.length}, closed ${closedTrades.length}`);
    
    return Response.json({
      processed: openTrades.length,
      closed: closedTrades.length,
      details: closedTrades
    });
  } catch (error) {
    console.error('[MONITOR] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});