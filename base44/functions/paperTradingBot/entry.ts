import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function fetchPricesViaLLM(base44, symbols) {
  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Get the CURRENT real-time market prices in USD for these cryptocurrency trading pairs: ${symbols.join(", ")}.
These are Binance perpetual futures symbols. Return ONLY a JSON object with the symbol as key and current price as a number.
For unknown/delisted symbols return null. Example: {"BTCUSDT": 65000.50, "ETHUSDT": 3200.00, "UNKNOWNUSDT": null}`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {},
        additionalProperties: true
      }
    });
    return result || {};
  } catch (e) {
    console.log(`[BOT] LLM error: ${e.message}`);
    return {};
  }
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
    console.log(`[BOT] Fetching prices for: ${symbols.join(", ")}`);

    const priceMap = await fetchPricesViaLLM(base44, symbols);
    console.log(`[BOT] Got prices: ${JSON.stringify(priceMap)}`);

    const closed = [];
    const log = [];

    for (const trade of openTrades) {
      const cur = priceMap[trade.symbol];
      if (!cur || !trade.entry_price) {
        console.log(`[BOT] No price for ${trade.symbol}`);
        continue;
      }

      const pnlPct = ((cur - trade.entry_price) / trade.entry_price) * 100;
      let reason = null;

      console.log(`[BOT] ${trade.symbol}: cur=${cur} SL=${trade.stop_loss} TP=${trade.take_profit}`);

      // SL check FIRST (most critical)
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