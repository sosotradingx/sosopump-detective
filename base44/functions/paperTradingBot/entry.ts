import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Fetch current price from Binance Futures
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

    // Allow both scheduled automation calls (no user) and manual admin calls
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user?.role === 'admin') isAdmin = true;
    } catch {
      // Called from automation (no user context) - use service role
    }

    // Get all open paper trades
    const allOpen = await base44.asServiceRole.entities.PaperTrade.filter({ status: "open" }, "-created_date", 500);

    if (allOpen.length === 0) {
      return Response.json({ message: "No open trades", closed: 0 });
    }

    const closed = [];
    const log = [];

    for (const trade of allOpen) {
      // Skip trades without SL/TP set
      if (!trade.stop_loss && !trade.take_profit) continue;

      const cur = await getPrice(trade.symbol);
      if (!cur) continue;

      const pnlPct = ((cur - trade.entry_price) / trade.entry_price) * 100;
      let reason = null;

      // Check Take Profit
      if (trade.take_profit > 0 && cur >= trade.take_profit) {
        reason = "take_profit";
      }
      // Check Stop Loss
      else if (trade.stop_loss > 0 && cur <= trade.stop_loss) {
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
        log.push(`CLOSED ${trade.symbol} | ${reason} | P&L: ${pnlPct.toFixed(2)}% | entry:${trade.entry_price} cur:${cur}`);
        console.log(log[log.length - 1]);
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