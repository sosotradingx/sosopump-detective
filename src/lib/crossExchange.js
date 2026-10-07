// Side-by-side Binance vs Bybit snapshot for the same perpetual:
// price spread, funding, open interest and its 1h change, 24h volume.
// Useful to tell a real, market-wide move from a local squeeze on one venue.

const B_FAPI = "https://fapi.binance.com";
const B_DATA = "https://fapi.binance.com/futures/data";
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

async function binanceSide(symbol) {
  const [tick, prem, oiHist] = await Promise.all([
    getJSON(`${B_FAPI}/fapi/v1/ticker/24hr?symbol=${symbol}`),
    getJSON(`${B_FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`),
    getJSON(`${B_DATA}/openInterestHist?symbol=${symbol}&period=1h&limit=2`),
  ]);
  const price = num(tick?.lastPrice) ?? num(prem?.markPrice);
  if (!price) return null;

  const oi = Array.isArray(oiHist) ? oiHist : [];
  const oiNow = num(oi[oi.length - 1]?.sumOpenInterest);
  const oiPrev = num(oi[oi.length - 2]?.sumOpenInterest);

  return {
    id: "binance",
    name: "Binance",
    price,
    change24h: num(tick?.priceChangePercent),
    funding: prem?.lastFundingRate != null ? num(prem.lastFundingRate) * 100 : null,
    oi: oiNow,
    oiChangePct: oiNow && oiPrev ? ((oiNow - oiPrev) / oiPrev) * 100 : null,
    volume24h: num(tick?.quoteVolume),
  };
}

async function bybitSide(symbol) {
  const [tick, oiHist] = await Promise.all([
    getJSON(`${BYBIT}/v5/market/tickers?category=linear&symbol=${symbol}`),
    getJSON(`${BYBIT}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=2`),
  ]);
  const t = tick?.result?.list?.[0];
  const price = num(t?.lastPrice);
  if (!price) return null;

  const oi = oiHist?.result?.list || []; // newest first
  const oiNow = num(t?.openInterest) ?? num(oi[0]?.openInterest);
  const oiPrev = num(oi[1]?.openInterest);
  const change = num(t?.price24hPcnt);

  return {
    id: "bybit",
    name: "Bybit",
    price,
    change24h: change != null ? change * 100 : null,
    funding: t?.fundingRate != null ? num(t.fundingRate) * 100 : null,
    oi: oiNow,
    oiChangePct: oiNow && oiPrev ? ((oiNow - oiPrev) / oiPrev) * 100 : null,
    volume24h: num(t?.turnover24h),
  };
}

export async function fetchCrossExchange(symbol) {
  const [binance, bybit] = await Promise.all([binanceSide(symbol), bybitSide(symbol)]);
  if (!binance && !bybit) return null;

  let spreadBps = null;
  let fundingDiff = null;
  let oiDiff = null;
  let volumeRatio = null;

  if (binance && bybit) {
    const mid = (binance.price + bybit.price) / 2;
    if (mid > 0) spreadBps = ((binance.price - bybit.price) / mid) * 10000;
    if (binance.funding != null && bybit.funding != null) fundingDiff = binance.funding - bybit.funding;
    if (binance.oiChangePct != null && bybit.oiChangePct != null) oiDiff = binance.oiChangePct - bybit.oiChangePct;
    if (binance.volume24h && bybit.volume24h) volumeRatio = binance.volume24h / bybit.volume24h;
  }

  return { symbol, binance, bybit, spreadBps, fundingDiff, oiDiff, volumeRatio, updatedAt: Date.now() };
}