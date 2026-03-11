// Binance Public API - no key required
const BASE_URL = "https://api.binance.com/api/v3";
const FAPI_URL = "https://fapi.binance.com/fapi/v1";

export async function fetchTopPairs(quoteAsset = "USDT", limit = 50, minVolume = 1000000) {
  const res = await fetch(`${BASE_URL}/ticker/24hr`);
  const data = await res.json();
  
  return data
    .filter(t => t.symbol.endsWith(quoteAsset) && parseFloat(t.quoteVolume) >= minVolume)
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, limit)
    .map(t => ({
      symbol: t.symbol,
      price: parseFloat(t.lastPrice),
      priceChange: parseFloat(t.priceChange),
      priceChangePercent: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.volume),
      quoteVolume: parseFloat(t.quoteVolume),
      high24h: parseFloat(t.highPrice),
      low24h: parseFloat(t.lowPrice),
      openPrice: parseFloat(t.openPrice),
      count: parseInt(t.count)
    }));
}

export async function fetchKlines(symbol, interval = "1h", limit = 100) {
  const res = await fetch(`${BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  const data = await res.json();
  
  return data.map(k => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: parseInt(k[8])
  }));
}

export async function fetchMultiTFKlines(symbol, timeframes = ["15m", "1h", "4h", "1d"]) {
  const results = {};
  const promises = timeframes.map(async (tf) => {
    const klines = await fetchKlines(symbol, tf, 100);
    results[tf] = klines;
  });
  await Promise.all(promises);
  return results;
}

export async function fetchOrderBook(symbol, limit = 20) {
  const res = await fetch(`${BASE_URL}/depth?symbol=${symbol}&limit=${limit}`);
  return await res.json();
}

export function formatVolume(vol) {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + "B";
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + "M";
  if (vol >= 1e3) return (vol / 1e3).toFixed(2) + "K";
  return vol.toFixed(2);
}

export function formatPrice(price) {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}