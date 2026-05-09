// KuCoin Public API - no key required, fully accessible globally
const KUCOIN_BASE = "https://api.kucoin.com/api/v1";
const KUCOIN_FUTURES = "https://api-futures.kucoin.com/api/v1";

// Convert KuCoin format (BTC-USDT) to standard format (BTCUSDT)
function formatSymbol(kucoinSym) {
  return kucoinSym.replace("-", "");
}

// Fetch all active USDT perpetual futures pairs
export async function fetchPerpetualPairs(limit = 100, minVolume = 500000) {
  let data;
  try {
    const res = await fetch(`${KUCOIN_FUTURES}/contracts/active`);
    data = await res.json();
  } catch (e) {
    console.log("[API] KuCoin futures error:", e.message);
    return [];
  }

  if (!data.data || !Array.isArray(data.data)) return [];

  const filtered = data.data
    .filter(t => t.symbol.endsWith("USDT") && parseFloat(t.volume24h || 0) >= minVolume)
    .sort((a, b) => parseFloat(b.volume24h || 0) - parseFloat(a.volume24h || 0));

  const sliced = limit === 0 ? filtered : filtered.slice(0, limit);

  return sliced.map(t => ({
    symbol: t.symbol,
    price: parseFloat(t.lastTradePrice),
    priceChange: parseFloat(t.priceChgPct || 0) * 100,
    priceChangePercent: parseFloat(t.priceChgPct || 0) * 100,
    volume: parseFloat(t.volume24h || 0),
    quoteVolume: parseFloat(t.turnover24h || 0),
    high24h: parseFloat(t.highPrice || 0),
    low24h: parseFloat(t.lowPrice || 0),
    openPrice: parseFloat(t.openPrice || 0),
    isPerpetual: true,
  }));
}

// Fetch spot pairs (if needed)
export async function fetchTopPairs(quoteAsset = "USDT", limit = 50, minVolume = 1000000) {
  let data;
  try {
    const res = await fetch(`${KUCOIN_BASE}/market/allTickers`);
    data = await res.json();
  } catch (e) {
    console.log("[API] KuCoin spot error:", e.message);
    return [];
  }

  if (!data.data || !Array.isArray(data.data.ticker)) return [];

  return data.data.ticker
    .filter(t => t.symbol.endsWith(`-${quoteAsset}`) && parseFloat(t.volValue || 0) >= minVolume)
    .sort((a, b) => parseFloat(b.volValue || 0) - parseFloat(a.volValue || 0))
    .slice(0, limit)
    .map(t => ({
      symbol: formatSymbol(t.symbol),
      price: parseFloat(t.last),
      priceChange: parseFloat(t.changePrice || 0),
      priceChangePercent: parseFloat(t.changeRate || 0) * 100,
      volume: parseFloat(t.vol || 0),
      quoteVolume: parseFloat(t.volValue || 0),
      high24h: parseFloat(t.high || 0),
      low24h: parseFloat(t.low || 0),
      openPrice: parseFloat(t.open || 0),
    }));
}

// Fetch klines from KuCoin
export async function fetchKlines(symbol, interval = "1h", limit = 100, isPerpetual = true) {
  const base = isPerpetual ? KUCOIN_FUTURES : KUCOIN_BASE;
  const endpoint = isPerpetual ? "/klines" : "/market/candles";
  
  let data;
  try {
    const res = await fetch(`${base}${endpoint}?symbol=${symbol}&type=${interval}&limit=${limit}`);
    data = await res.json();
  } catch (e) {
    console.log(`[API] KuCoin klines error for ${symbol}:`, e.message);
    return [];
  }

  if (!data.data || !Array.isArray(data.data)) return [];

  // KuCoin returns [time, open, high, low, close, volume]
  return data.data.map(k => ({
    time: parseInt(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: parseInt(k[0]),
    quoteVolume: 0, // KuCoin doesn't provide in klines
    trades: 0,
  }));
}

// Batch analyze pairs with rate limiting
export async function analyzePairsInBatches(pairs, analyzeOnePair, batchSize = 25, delayMs = 300, onProgress) {
  const results = [];
  for (let i = 0; i < pairs.length; i += batchSize) {
    const chunk = pairs.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(p => analyzeOnePair(p)));
    results.push(...chunkResults);
    if (onProgress) onProgress(results.length, pairs.length);
    if (i + batchSize < pairs.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

// Fetch multiple timeframe klines
export async function fetchMultiTFKlines(symbol, timeframes = ["15m", "1h", "4h", "1d"]) {
  const results = {};
  const promises = timeframes.map(async (tf) => {
    const klines = await fetchKlines(symbol, tf, 100, true);
    results[tf] = klines;
  });
  await Promise.all(promises);
  return results;
}

// Format volume for display
export function formatVolume(vol) {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + "B";
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + "M";
  if (vol >= 1e3) return (vol / 1e3).toFixed(2) + "K";
  return vol.toFixed(2);
}

// Format price for display
export function formatPrice(price) {
  if (!price) return "0";
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}