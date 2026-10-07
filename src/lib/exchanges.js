// Unified market-data adapters for the visual Pump Scanner.
// Currently supports Binance (Futures/Spot, via binanceApi) and Bybit (linear perpetuals).
// Trading & bot logic remain on Binance — these helpers are scanner-view only.

import { fetchPerpetualPairs, fetchKlines, fetchOrderBook } from "@/components/scanner/binanceApi";
import { isStablecoin } from "@/lib/marketMetrics";

export const EXCHANGES = [
  { id: "binance", name: "Binance", label: "Binance Futures", market: "perpetuals" },
  { id: "bybit", name: "Bybit", label: "Bybit Perpetuals", market: "perpetuals" },
];

export const DEFAULT_EXCHANGE = "binance";

// Map common TF strings -> Bybit v5 interval codes (Binance already accepts 1m/1h/4h/1d).
const BYBIT_TF = {
  "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
  "1h": "60", "2h": "120", "4h": "240", "1d": "D", "1w": "W",
};
function bybitInterval(tf) { return BYBIT_TF[tf] || "60"; }

// --- Bybit linear perpetual tickers (24h) ---
async function bybitPerpetuals(limit, minVolume) {
  try {
    const res = await fetch("https://api.bybit.com/v5/market/tickers?category=linear");
    const json = await res.json();
    const list = json?.result?.list;
    if (!Array.isArray(list)) return [];

    const mapped = list
      .filter(t => typeof t.symbol === "string" && t.symbol.endsWith("USDT"))
      .map(t => {
        const price = parseFloat(t.lastPrice);
        const prev = parseFloat(t.prevPrice24h);
        return {
          symbol: t.symbol,
          price,
          priceChange: price - prev,
          priceChangePercent: parseFloat(t.price24hPcnt) * 100,
          volume: parseFloat(t.volume24h),
          quoteVolume: parseFloat(t.turnover24h),
          high24h: parseFloat(t.highPrice24h),
          low24h: parseFloat(t.lowPrice24h),
          openPrice: prev,
          count: 0,
          isPerpetual: true,
        };
      })
      .filter(t => t.quoteVolume >= minVolume)
      .sort((a, b) => b.quoteVolume - a.quoteVolume);

    return limit === 0 ? mapped : mapped.slice(0, limit);
  } catch {
    return [];
  }
}

// --- Bybit klines (newest-first -> normalized ascending) ---
async function bybitKlines(symbol, tf, limit) {
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval(tf)}&limit=${limit}`
    );
    const json = await res.json();
    const list = json?.result?.list;
    if (!Array.isArray(list)) return [];
    return list.slice().reverse().map(k => ({
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: Number(k[0]) + 60000,
      quoteVolume: parseFloat(k[6]),
      trades: 0,
    }));
  } catch {
    return [];
  }
}

// Scanner pair list (perpetuals only — spot stays Binance via binanceApi).
export async function fetchScannerPairs(exchange, limit, minVolume) {
  if (exchange === "bybit") return bybitPerpetuals(limit, minVolume);
  return fetchPerpetualPairs(limit, minVolume);
}

// Scanner klines (perpetuals only).
export async function fetchScannerKlines(exchange, symbol, tf, limit) {
  if (exchange === "bybit") return bybitKlines(symbol, tf, limit);
  return fetchKlines(symbol, tf, limit, true);
}

// --- Two-tier universe: top pairs by volume + "climbers" that jumped in the
// 24h volume ranking (catches low-cap coins starting to move before they hit the top).
const RANK_KEY = "soso_volume_rank";
export async function buildUniverse(exchange, { deepLimit = 50, scanLimit = 200, minVolume = 1000000, minRankJump = 20 } = {}) {
  const all = await fetchScannerPairs(exchange, scanLimit, minVolume);
  if (!all.length) return { universe: [], climbers: [], scanned: 0 };

  const deep = all.slice(0, deepLimit);
  const ranks = {};
  all.forEach((p, i) => { ranks[p.symbol] = i + 1; });

  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(`${RANK_KEY}_${exchange}`) || "null"); } catch { prev = null; }
  try { localStorage.setItem(`${RANK_KEY}_${exchange}`, JSON.stringify(ranks)); } catch {}

  const climbers = [];
  if (prev) {
    all.forEach(p => {
      const before = prev[p.symbol];
      if (before && before - ranks[p.symbol] >= minRankJump) climbers.push(p);
    });
  }

  const seen = new Set(deep.map(p => p.symbol));
  const extra = climbers.filter(p => !seen.has(p.symbol)).slice(0, 20);
  const universe = [...deep, ...extra].filter(p => !isStablecoin(p.symbol));

  return { universe, climbers: extra, scanned: all.length };
}

// --- Bybit order book (linear perpetual) ---
async function bybitOrderBook(symbol, limit) {
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${symbol}&limit=${limit}`
    );
    const json = await res.json();
    const r = json?.result;
    if (!r) return { bids: [], asks: [] };
    return { bids: r.b || r.bids || [], asks: r.a || r.asks || [] };
  } catch {
    return { bids: [], asks: [] };
  }
}

// Scanner order book (normalized { bids, asks } as [price, qty] pairs).
export async function fetchScannerOrderBook(exchange, symbol, limit = 10) {
  if (exchange === "bybit") return bybitOrderBook(symbol, limit);
  return fetchOrderBook(symbol, limit);
}

// Persisted exchange preference (shared across Scanner/Dashboard/PairDetail).
const EXCHANGE_KEY = "soso_preferred_exchange";
export function getPreferredExchange() {
  try {
    const v = localStorage.getItem(EXCHANGE_KEY);
    return EXCHANGES.some(e => e.id === v) ? v : DEFAULT_EXCHANGE;
  } catch {
    return DEFAULT_EXCHANGE;
  }
}
export function setPreferredExchange(exchange) {
  try { localStorage.setItem(EXCHANGE_KEY, exchange); } catch {}
}

// TradingView prefix for an exchange (perp funding tickers).
export function tradingViewPrefix(exchange) {
  return exchange === "bybit" ? "BYBIT:" : "BINANCE:";
}

export function exchangeName(exchange) {
  return (EXCHANGES.find(e => e.id === exchange) || EXCHANGES[0]).name;
}

// Live kline WebSocket subscription for Binance (spot/futures) and Bybit (linear perp).
// onUpdate receives { time(sec), open, high, low, close, volume, closed }.
export function subscribeLiveKlines(exchange, symbol, tf, isPerpetual, onUpdate) {
  let ws = null;
  let closed = false;
  try {
    if (exchange === "bybit") {
      ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");
      ws.onopen = () => {
        if (closed) return;
        ws.send(JSON.stringify({ op: "subscribe", args: [`kline.${bybitInterval(tf)}.${symbol}`] }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.topic && msg.topic.startsWith("kline.") && Array.isArray(msg.data)) {
            const k = msg.data[msg.data.length - 1];
            if (!k) return;
            onUpdate({
              time: Math.floor(Number(k.start) / 1000),
              open: parseFloat(k.open), high: parseFloat(k.high), low: parseFloat(k.low), close: parseFloat(k.close),
              volume: parseFloat(k.volume), closed: k.confirm === true || k.confirm === "true",
            });
          }
        } catch {}
      };
    } else {
      const base = isPerpetual ? "wss://fstream.binance.com/ws" : "wss://stream.binance.com:9443/ws";
      ws = new WebSocket(`${base}/${symbol.toLowerCase()}@kline_${tf}`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const k = msg?.k;
          if (!k) return;
          onUpdate({
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c),
            volume: parseFloat(k.v), closed: !!k.x,
          });
        } catch {}
      };
    }
  } catch {}
  return () => {
    closed = true;
    if (ws) { try { ws.close(); } catch {} }
  };
}