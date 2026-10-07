// Live liquidation feed from public WebSockets (no API key):
//  - Binance: all-market futures forceOrder stream
//  - Bybit:  per-symbol allLiquidation topics (only the pairs being scanned)
// Aggregates liquidated notional per symbol over rolling 5m / 15m windows.
// Liquidation direction is named after the position that got liquidated:
// "long" = longs were force-sold (downward cascade), "short" = shorts squeezed (upward).

const FIVE = 5 * 60 * 1000;
const FIFTEEN = 15 * 60 * 1000;
const SQUEEZE_USD = 250000; // minimum notional before we call it a cascade
const MAX_EVENTS = 6000;

const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : Math.round(n));

export function createLiquidationFeed(exchange, symbols, onUpdate) {
  const events = [];
  const last = {}; // symbol -> { price, side, ts }
  let ws = null;
  let stopped = false;
  let timer = null;
  let retry = 0;
  let connected = false;

  const push = (symbol, side, price, usd, ts) => {
    events.push({ symbol, side, usd, ts });
    last[symbol] = { price, side, ts };
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  };

  const aggregate = () => {
    const now = Date.now();
    while (events.length && now - events[0].ts > FIFTEEN) events.shift();

    const bySymbol = {};
    let long5 = 0, short5 = 0, long15 = 0, short15 = 0;

    events.forEach(e => {
      const row = bySymbol[e.symbol] || (bySymbol[e.symbol] = { symbol: e.symbol, long5: 0, short5: 0, long15: 0, short15: 0, count: 0 });
      const inFive = now - e.ts <= FIVE;
      if (e.side === "long") {
        row.long15 += e.usd; long15 += e.usd;
        if (inFive) { row.long5 += e.usd; long5 += e.usd; }
      } else {
        row.short15 += e.usd; short15 += e.usd;
        if (inFive) { row.short5 += e.usd; short5 += e.usd; }
      }
      row.count += 1;
    });

    const top = Object.values(bySymbol)
      .map(r => {
        const total5 = r.long5 + r.short5;
        const lead =
          r.short5 > r.long5 * 2.5 && r.short5 > SQUEEZE_USD ? "short" :
          r.long5 > r.short5 * 2.5 && r.long5 > SQUEEZE_USD ? "long" : null;
        return { ...r, total5, total15: r.long15 + r.short15, lead, last: last[r.symbol] || null };
      })
      .sort((a, b) => b.total5 - a.total5)
      .slice(0, 8);

    onUpdate({ exchange, bySymbol, top, long5, short5, long15, short15, total5: long5 + short5, connected, updatedAt: now });
  };

  // Throttle DOM updates to ~1 per second while a cascade is running
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; if (!stopped) aggregate(); }, 900);
  };

  const reconnect = () => {
    if (stopped || retry > 5) return;
    retry += 1;
    setTimeout(() => { if (!stopped) start(); }, 2000 * retry);
  };

  const connectBinance = () => {
    ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
    ws.onopen = () => { connected = true; retry = 0; aggregate(); };
    ws.onmessage = (ev) => {
      try {
        const o = JSON.parse(ev.data)?.o;
        if (!o || !o.s) return;
        const price = parseFloat(o.ap || o.p);
        const qty = parseFloat(o.q);
        if (!Number.isFinite(price) || !Number.isFinite(qty)) return;
        // order side SELL => a LONG position was liquidated, BUY => a SHORT was liquidated
        push(o.s, o.S === "SELL" ? "long" : "short", price, price * qty, Number(o.T) || Date.now());
        schedule();
      } catch {}
    };
    ws.onclose = () => { connected = false; schedule(); reconnect(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  };

  const connectBybit = () => {
    const list = (symbols || []).slice(0, 30);
    ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");
    ws.onopen = () => {
      connected = true; retry = 0; aggregate();
      for (let i = 0; i < list.length; i += 10) {
        ws.send(JSON.stringify({ op: "subscribe", args: list.slice(i, i + 10).map(s => `allLiquidation.${s}`) }));
      }
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m?.op === "ping") { ws.send(JSON.stringify({ op: "pong" })); return; }
        if (!m.topic || !m.topic.startsWith("allLiquidation.") || !Array.isArray(m.data)) return;
        m.data.forEach(d => {
          const price = parseFloat(d.p);
          const qty = parseFloat(d.v);
          if (!Number.isFinite(price) || !Number.isFinite(qty)) return;
          // order side Sell => a LONG position was liquidated, Buy => a SHORT was liquidated
          push(d.s, d.S === "Sell" ? "long" : "short", price, price * qty, Number(d.T) || Date.now());
        });
        schedule();
      } catch {}
    };
    ws.onclose = () => { connected = false; schedule(); reconnect(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  };

  const start = () => {
    try {
      if (exchange === "bybit") connectBybit(); else connectBinance();
    } catch {
      connected = false;
      reconnect();
    }
  };

  start();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (ws) { try { ws.onclose = null; ws.close(); } catch {} }
  };
}

export { fmt as formatUsd };