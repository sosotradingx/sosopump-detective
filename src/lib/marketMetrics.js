// Public derivatives & microstructure metrics for Binance / Bybit perpetuals.
// No API key required. Any source that fails degrades to null — the scanner keeps working.

const B_FAPI = "https://fapi.binance.com";
const B_DATA = "https://fapi.binance.com/futures/data";
const B_SPOT = "https://api.binance.com/api/v3";
const BYBIT = "https://api.bybit.com";

async function getJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const STABLES = ["USDC", "FDUSD", "TUSD", "USDP", "DAI", "BUSD", "USDE", "USDD", "PYUSD", "USD1", "XUSD", "USTC", "EUR", "EURI", "AEUR"];
export function isStablecoin(symbol) {
  const base = String(symbol || "").replace(/USDT$/, "");
  return STABLES.includes(base);
}

// --- Binance: OI Δ, funding, long/short, perp/spot volume ---
async function binanceDerivatives(symbol) {
  const [oiHist, prem, lsr, fut, spot] = await Promise.all([
    getJSON(`${B_DATA}/openInterestHist?symbol=${symbol}&period=1h&limit=5`),
    getJSON(`${B_FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`),
    getJSON(`${B_DATA}/topLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`),
    getJSON(`${B_FAPI}/fapi/v1/ticker/24hr?symbol=${symbol}`),
    getJSON(`${B_SPOT}/ticker/24hr?symbol=${symbol}`),
  ]);

  const oi = Array.isArray(oiHist) ? oiHist : [];
  const oiNow = oi.length ? num(oi[oi.length - 1].sumOpenInterest) : null;
  const oiPrev = oi.length > 1 ? num(oi[oi.length - 2].sumOpenInterest) : null;
  const futVol = num(fut?.quoteVolume);
  const spotVol = num(spot?.quoteVolume);

  return {
    oi: oiNow,
    oiChangePct: oiNow && oiPrev ? ((oiNow - oiPrev) / oiPrev) * 100 : null,
    fundingRate: prem?.lastFundingRate != null ? num(prem.lastFundingRate) * 100 : null,
    longShortRatio: num(Array.isArray(lsr) && lsr.length ? lsr[0].longShortRatio : null),
    perpSpotRatio: futVol && spotVol ? futVol / spotVol : null,
    quoteVolume: futVol,
    trades: num(fut?.count),
  };
}

// --- Bybit: OI Δ, funding, long/short ---
async function bybitDerivatives(symbol) {
  const [tk, oiHist, lsr] = await Promise.all([
    getJSON(`${BYBIT}/v5/market/tickers?category=linear&symbol=${symbol}`),
    getJSON(`${BYBIT}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=5`),
    getJSON(`${BYBIT}/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1h&limit=1`),
  ]);

  const t = tk?.result?.list?.[0];
  const oi = oiHist?.result?.list || []; // newest first
  const oiNow = num(t?.openInterest) ?? num(oi[0]?.openInterest);
  const oiPrev = oi.length > 1 ? num(oi[1]?.openInterest) : null;
  const ar = lsr?.result?.list?.[0];
  const buy = num(ar?.buyRatio);
  const sell = num(ar?.sellRatio);

  return {
    oi: oiNow,
    oiChangePct: oiNow && oiPrev ? ((oiNow - oiPrev) / oiPrev) * 100 : null,
    fundingRate: t?.fundingRate != null ? num(t.fundingRate) * 100 : null,
    longShortRatio: buy && sell ? buy / sell : null,
    perpSpotRatio: null,
    quoteVolume: num(t?.turnover24h),
    trades: null,
  };
}

export async function fetchDerivatives(exchange, symbol) {
  const d = exchange === "bybit" ? await bybitDerivatives(symbol) : await binanceDerivatives(symbol);
  return { exchange, symbol, ...d };
}

// --- Order book depth imbalance inside a ±pct band (notional) ---
export function orderBookImbalance(orderBook, midPrice, pct = 2) {
  if (!orderBook || !midPrice) return { imbalance: null, bidDepth: null, askDepth: null };
  const band = midPrice * (pct / 100);
  const lo = midPrice - band;
  const hi = midPrice + band;

  const sum = (rows) => (rows || []).reduce((s, r) => {
    const p = parseFloat(r[0]);
    const q = parseFloat(r[1]);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return s;
    return p >= lo && p <= hi ? s + p * q : s;
  }, 0);

  const bidDepth = sum(orderBook.bids);
  const askDepth = sum(orderBook.asks);
  const total = bidDepth + askDepth;
  return { imbalance: total > 0 ? bidDepth / total : null, bidDepth, askDepth };
}

// --- BTC context so altcoin moves can be judged as excess return (alpha) ---
export async function fetchBtcContext(fetchKlinesFn) {
  const kl = await fetchKlinesFn("BTCUSDT", "1h", 25);
  if (!kl || kl.length < 5) return { change1h: null, change24h: null, ok: false };
  const last = kl[kl.length - 1].close;
  return {
    change1h: kl[kl.length - 2] ? ((last / kl[kl.length - 2].close) - 1) * 100 : null,
    change24h: kl.length >= 25 ? ((last / kl[0].close) - 1) * 100 : null,
    ok: true,
  };
}