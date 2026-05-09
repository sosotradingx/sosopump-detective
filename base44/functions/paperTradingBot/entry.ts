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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Fetch ALL paper trades and filter manually (RLS nested data issue with filter)
    const allTrades = await base44.asServiceRole.entities.PaperTrade.list("-created_date", 1000);
    const allOpen = allTrades.filter(t => t.status === "open");

    console.log(`Total trades: ${allTrades.length}, Open: ${allOpen.length}`);

    if (!allOpen.length) {
      return Response.json({ message: "No open trades", closed: [], log: [] });
    }

    // Fetch all prices in parallel
    const symbols = [...new Set(allOpen.map(t => t.symbol))];
    const priceMap = {};
    await Promise.all(symbols.map(async (sym) => {
      const p = await getPrice(sym);
      if (p) priceMap[sym] = p;
    }));

    console.log(`Fetched prices for ${Object.keys(priceMap).length} symbols`);

    const closed = [];
    const log = [];

    for (const trade of allOpen) {
      const cur = priceMap[trade.symbol];
      if (!cur || !trade.entry_price) continue;

      const pnlPct = ((cur - trade.entry_price) / trade.entry_price) * 100;
      let reason = null;

      // SL check FIRST (most critical)
      if (trade.stop_loss > 0 && cur <= trade.stop_loss) {
        reason = "stop_loss";
      }
      // TP check second
      else if (trade.take_profit > 0 && cur >= trade.take_profit) {
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
        log.push(`CLOSED ${trade.symbol} | ${reason} | cur:${cur} | SL:${trade.stop_loss} TP:${trade.take_profit} | P&L:${pnlPct.toFixed(2)}%`);
        console.log(`CLOSED ${trade.symbol} | ${reason} | cur:${cur} | P&L:${pnlPct.toFixed(2)}%`);
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