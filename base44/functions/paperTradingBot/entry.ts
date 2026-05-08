import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getPrice(symbol) {
  try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    const d = await r.json();
    return d.price ? parseFloat(d.price) : null;
  } catch {
    return null;
  }
}

async function fetchKlines(symbol, timeframe, limit) {
  try {
    const tfMap = { "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440 };
    const interval = Object.keys(tfMap).find(k => tfMap[k] === parseInt(timeframe)) || "1h";
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const data = await r.json();
    return data.map(k => ({ time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[7]) }));
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let currentUser = null;
    try {
      currentUser = await base44.auth.me();
    } catch {
      // Called from automation - use service role only for exits
    }

    // Get all open paper trades
    const allOpen = await base44.asServiceRole.entities.PaperTrade.filter({ status: "open" }, "-created_date", 500);

    const closed = [];
    const log = [];

    // --- Close trades on SL/TP ---
    for (const trade of allOpen) {
      if (!trade.stop_loss && !trade.take_profit) continue;

      const cur = await getPrice(trade.symbol);
      if (!cur) continue;

      const pnlPct = ((cur - trade.entry_price) / trade.entry_price) * 100;
      let reason = null;

      if (trade.take_profit > 0 && cur >= trade.take_profit) {
        reason = "take_profit";
      } else if (trade.stop_loss > 0 && cur <= trade.stop_loss) {
        reason = "stop_loss";
      }

      if (reason) {
        const pnlUsd = (cur - trade.entry_price) * trade.quantity;
        await base44.asServiceRole.entities.PaperTrade.update(trade.id, {
          status: "closed",
          exit_price: cur,
          pnl_percent: Math.round(pnlPct * 100) / 100,
          pnl_usd: Math.round(pnlUsd * 100) / 100,
          exit_reason: reason,
        });
        closed.push(trade.symbol);
        log.push(`CLOSED ${trade.symbol} | ${reason} | P&L: ${pnlPct.toFixed(2)}%`);
      }
    }

    // --- Open new trades ---
    if (currentUser) {
      const cfg = currentUser.bot_config || {};
      const minScore = cfg.minScore || 70;
      const tradeSize = cfg.tradeSize || 200;
      const maxOpenTrades = cfg.maxOpenTrades || 5;
      const stopLossPct = cfg.stopLossPct || 5;
      const takeProfitPct = cfg.takeProfitPct || 30;
      const timeframe = cfg.timeframe || "1h";

      const freshOpen = (await base44.asServiceRole.entities.PaperTrade.filter({ created_by: currentUser.email, status: "open" }, "-created_date", 100)) || [];
      if (freshOpen.length < maxOpenTrades) {
        // Fetch top pairs
        try {
          const r = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
          const allPairs = await r.json();
          
          const topPairs = allPairs
            .filter(p => p.symbol.endsWith("USDT") && parseFloat(p.quoteAssetVolume) > 500000)
            .sort((a, b) => parseFloat(b.quoteAssetVolume) - parseFloat(a.quoteAssetVolume))
            .slice(0, 100);

          const openSymbols = new Set(freshOpen.map(t => t.symbol));

          for (const pair of topPairs) {
            if (freshOpen.length >= maxOpenTrades) break;
            if (openSymbols.has(pair.symbol)) continue;

            const kl = await fetchKlines(pair.symbol, timeframe, 60);
            if (kl.length < 5) continue;

            // Simple pump detection: volume spike + price rise
            const lastClose = kl[kl.length - 1].close;
            const avgVolume = kl.slice(0, -1).reduce((s, k) => s + k.volume, 0) / (kl.length - 1);
            const lastVolume = kl[kl.length - 1].volume;
            const priceChange = ((lastClose - kl[0].open) / kl[0].open) * 100;

            if (lastVolume > avgVolume * 2.5 && priceChange > 5) {
              const stopLoss = Math.round(lastClose * (1 - stopLossPct / 100) * 10000) / 10000;
              const takeProfit = Math.round(lastClose * (1 + takeProfitPct / 100) * 10000) / 10000;
              const quantity = Math.floor((tradeSize / lastClose) * 1000) / 1000;

              await base44.asServiceRole.entities.PaperTrade.create({
                created_by: currentUser.email,
                symbol: pair.symbol,
                side: "BUY",
                status: "open",
                entry_price: lastClose,
                quantity,
                stop_loss: stopLoss,
                take_profit: takeProfit,
                pump_score_at_entry: Math.round(priceChange * 10) / 10,
                notes: `Auto | TF:${timeframe} | Vol:${(lastVolume / avgVolume).toFixed(1)}x`,
              });
              
              openSymbols.add(pair.symbol);
              log.push(`OPENED ${pair.symbol} | Entry:${lastClose} | SL:${stopLoss} TP:${takeProfit}`);
              freshOpen.push({ symbol: pair.symbol });
            }
          }
        } catch (e) {
          log.push(`Scan error: ${e.message}`);
        }
      }
    }

    return Response.json({
      message: `Checked ${allOpen.length} trades, closed ${closed.length}`,
      closed,
      log,
    });
  } catch (error) {
    console.error("paperTradingBot error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});