import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// KuCoin - not geo-blocked, returns real prices
async function fetchPricesKuCoin(symbols) {
  const priceMap = {};
  try {
    const r = await fetch("https://api.kucoin.com/api/v1/market/allTickers", {
      headers: { "Accept": "application/json" }
    });
    if (!r.ok) {
      console.log(`[BOT] KuCoin failed: ${r.status}`);
      return priceMap;
    }
    const data = await r.json();
    const list = data?.data?.ticker || [];
    for (const item of list) {
      // KuCoin uses BTC-USDT format, Binance uses BTCUSDT
      const sym = item.symbol.replace("-", "");
      if (symbols.includes(sym) && item.last) {
        priceMap[sym] = parseFloat(item.last);
      }
    }
    console.log(`[BOT] KuCoin prices: ${Object.keys(priceMap).length}/${symbols.length}`);
  } catch (e) {
    console.log(`[BOT] KuCoin error: ${e.message}`);
  }
  return priceMap;
}

// OKX as secondary fallback
async function fetchPricesOKX(symbols) {
  const priceMap = {};
  try {
    const r = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
      headers: { "Accept": "application/json" }
    });
    if (!r.ok) {
      console.log(`[BOT] OKX failed: ${r.status}`);
      return priceMap;
    }
    const data = await r.json();
    const list = data?.data || [];
    for (const item of list) {
      // OKX uses BTC-USDT format
      const sym = item.instId.replace("-", "");
      if (symbols.includes(sym) && item.last) {
        priceMap[sym] = parseFloat(item.last);
      }
    }
    console.log(`[BOT] OKX prices: ${Object.keys(priceMap).length}`);
  } catch (e) {
    console.log(`[BOT] OKX error: ${e.message}`);
  }
  return priceMap;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const allTrades = await base44.asServiceRole.entities.PaperTrade.list("-created_date", 500);
    const openTrades = allTrades.filter(t => t.status === "open");

    console.log(`[BOT] Open trades: ${openTrades.length}`);

    if (!openTrades.length) {
      return Response.json({ message: "No open trades", closed: [], log: [] });
    }

    const symbols = [...new Set(openTrades.map(t => t.symbol))];
    console.log(`[BOT] Symbols: ${symbols.join(", ")}`);

    // Primary: KuCoin
    let priceMap = await fetchPricesKuCoin(symbols);

    // Fallback: OKX for missing symbols
    const missing = symbols.filter(s => !priceMap[s]);
    if (missing.length > 0) {
      console.log(`[BOT] Missing after KuCoin: ${missing.join(", ")}`);
      const okxPrices = await fetchPricesOKX(missing);
      priceMap = { ...priceMap, ...okxPrices };
    }

    const stillMissing = symbols.filter(s => !priceMap[s]);
    if (stillMissing.length > 0) {
      console.log(`[BOT] No price found for: ${stillMissing.join(", ")} - skipping`);
    }

    const closed = [];
    const log = [];

    for (const trade of openTrades) {
      const cur = priceMap[trade.symbol];
      if (!cur || !trade.entry_price) {
        console.log(`[BOT] No price for ${trade.symbol}, skipping`);
        continue;
      }

      const pnlPct = ((cur - trade.entry_price) / trade.entry_price) * 100;
      let reason = null;

      console.log(`[BOT] ${trade.symbol}: cur=${cur} | SL=${trade.stop_loss} | TP=${trade.take_profit} | PnL=${pnlPct.toFixed(2)}%`);

      if (trade.stop_loss > 0 && cur <= trade.stop_loss) {
        reason = "stop_loss";
      } else if (trade.take_profit > 0 && cur >= trade.take_profit) {
        reason = "take_profit";
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
        log.push(`CLOSED ${trade.symbol} | ${reason} | cur:${cur} | P&L:${pnlPct.toFixed(2)}%`);
        console.log(`[BOT] CLOSED ${trade.symbol} via ${reason}`);
      }
    }

    return Response.json({
      message: `Checked ${openTrades.length} open trades, closed ${closed.length}`,
      closed,
      log,
    });
  } catch (error) {
    console.error("[BOT] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});