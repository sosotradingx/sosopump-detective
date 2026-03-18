// Binance Public API - no key required
const BASE_URL = "https://api.binance.com/api/v3";
const FAPI_URL = "https://fapi.binance.com/fapi/v1";

// --- Fetch all active USDT perpetual futures pairs ---
export async function fetchPerpetualPairs(limit = 100, minVolume = 500000) {
  const res = await fetch(`${FAPI_URL}/ticker/24hr`);
  const data = await res.json();

  const filtered = data
    .filter(t => t.symbol.endsWith("USDT") && parseFloat(t.quoteVolume) >= minVolume)
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

  const sliced = limit === 0 ? filtered : filtered.slice(0, limit); // 0 = toate

  return sliced.map(t => ({
    symbol: t.symbol,
    price: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
    high24h: parseFloat(t.highPrice),
    low24h: parseFloat(t.lowPrice),
    openPrice: parseFloat(t.openPrice),
    count: parseInt(t.count),
    isPerpetual: true,
  }));
}

// Legacy spot pairs (kept for compatibility)
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

// Fetch klines - supports both spot and futures
export async function fetchKlines(symbol, interval = "1h", limit = 100, isPerpetual = false) {
  const base = isPerpetual ? FAPI_URL : BASE_URL;
  const res = await fetch(`${base}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
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

// Batch analyze pairs with safe rate limiting (batchSize pairs at a time, delay between batches)
export async function analyzePairsInBatches(pairs, analyzeOnePair, batchSize = 25, delayMs = 300, onProgress) {
  const results = [];
  for (let i = 0; i < pairs.length; i += batchSize) {
    const chunk = pairs.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(p => analyzeOnePair(p)));
    results.push(...chunkResults);
    if (onProgress) onProgress(results.length, pairs.length);
    // Delay between batches to avoid rate limits (skip delay on last batch)
    if (i + batchSize < pairs.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
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
  if (!price) return "0";
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}