// v3.3 — Advanced precision layer for the pump engine.
// Adds per-coin normalization (z-score), microstructure signals, derivatives,
// a two-axis score (Pump Strength / Manipulation Probability), a distribution
// status (DUMP RISK) and the 5m -> 15m -> 1h/4h confirmation cascade.
import { analyzePump } from "@/components/scanner/pumpEngine";

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};
const pctRank = (arr, v) => {
  if (!arr.length) return 50;
  return (arr.filter(x => x <= v).length / arr.length) * 100;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

function bbWidthHistory(closes, length = 20, mult = 2) {
  const out = [];
  for (let i = length; i <= closes.length; i++) {
    const sl = closes.slice(i - length, i);
    const m = mean(sl);
    out.push(m > 0 ? (mult * 2 * std(sl)) / m : 0);
  }
  return out;
}

function obvTrend(klines, window = 20) {
  const w = klines.slice(-window);
  let acc = 0;
  const series = [];
  for (let i = 1; i < w.length; i++) {
    if (w[i].close > w[i - 1].close) acc += w[i].volume;
    else if (w[i].close < w[i - 1].close) acc -= w[i].volume;
    series.push(acc);
  }
  if (series.length < 4) return { rising: false };
  const half = Math.floor(series.length / 2);
  return { rising: mean(series.slice(half)) > mean(series.slice(0, half)) };
}

// --- Microstructure + normalized (z-score) metrics for one timeframe ---
export function microMetrics(klines, base) {
  const empty = {
    valid: false, price: 0, volumeZ: 0, seasonalZ: 0, retZ: 0, bbWidthPct: 50, bbWidthPctPrev: 50,
    squeezeRelease: false, clv: 0, upperWick: 0, closesNearHigh: 0.5, absorption: false, amihud: 0,
    takerBuyRatio: null, cvdRising: null, obvRising: false, distAtr21: 0, bearishDiv: false,
    volFadeGreen: false, avgTradeNotional: null,
  };
  if (!klines || klines.length < 40 || !base) return empty;

  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const times = klines.map(k => k.time || k.closeTime || 0);
  const n = klines.length;
  const last = klines[n - 1];

  // Returns + per-coin volatility (z-score normalization instead of fixed %)
  const returns = [];
  for (let i = 1; i < n; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  const retWindow = returns.slice(-Math.min(120, returns.length));
  const retStd = std(retWindow);
  const retZ = retStd > 0 ? returns[returns.length - 1] / retStd : 0;

  // Volume z-score vs its own history
  const volWindow = volumes.slice(-Math.min(120, volumes.length), -1);
  const vMean = mean(volWindow);
  const vStd = std(volWindow);
  const volumeZ = vStd > 0 ? (volumes[n - 1] - vMean) / vStd : 0;

  // Seasonality: same hour-of-day across previous days
  const lastTime = times[n - 1];
  const sameHour = [];
  if (lastTime) {
    const h = new Date(lastTime).getUTCHours();
    for (let i = 0; i < n - 1; i++) {
      if (times[i] && new Date(times[i]).getUTCHours() === h) sameHour.push(volumes[i]);
    }
  }
  const seasonalZ = sameHour.length >= 5 && std(sameHour) > 0
    ? (volumes[n - 1] - mean(sameHour)) / std(sameHour)
    : 0;

  // Compression -> expansion (BB width percentile + release)
  const widths = bbWidthHistory(closes.slice(-Math.min(150, n)), 20, 2);
  const wNow = widths[widths.length - 1] ?? 0;
  const wPriorSeries = widths.slice(0, -1);
  const bbWidthPct = pctRank(widths, wNow);
  const bbWidthPctPrev = wPriorSeries.length ? pctRank(wPriorSeries, wPriorSeries[wPriorSeries.length - 1]) : bbWidthPct;
  const priorHigh = Math.max(...klines.slice(-21, -1).map(k => k.high));
  const squeezeRelease = bbWidthPctPrev <= 12 && last.close > priorHigh && volumeZ >= 1;

  // Candle structure
  const range = last.high - last.low;
  const clv = range > 0 ? ((last.close - last.low) - (last.high - last.close)) / range : 0;
  const upperWick = range > 0 ? (last.high - Math.max(last.open, last.close)) / range : 0;
  const closesNearHigh = mean(klines.slice(-5).map(k => (k.high - k.low > 0 ? (k.close - k.low) / (k.high - k.low) : 0.5)));

  // Absorption: abnormal volume with almost no price move (discreet accumulation)
  const absorption = volumeZ >= 1.5 && Math.abs(retZ) < 0.6;

  // Amihud illiquidity: % price move per $1M traded
  const amihudArr = [];
  for (let i = Math.max(1, n - 20); i < n; i++) {
    const qv = klines[i].quoteVolume || klines[i].volume * klines[i].close || 0;
    if (qv > 0) amihudArr.push(Math.abs(returns[i - 1] || 0) / (qv / 1e6));
  }
  const amihud = mean(amihudArr) * 100;

  // Taker buy ratio + CVD (Binance klines carry taker buy volume; Bybit does not)
  const w20 = klines.slice(-20);
  const hasTaker = w20.some(k => typeof k.takerBuy === "number" && k.takerBuy > 0);
  let takerBuyRatio = null;
  let cvdRising = null;
  if (hasTaker) {
    const tb = w20.reduce((s, k) => s + (k.takerBuy || 0), 0);
    const tv = w20.reduce((s, k) => s + k.volume, 0);
    takerBuyRatio = tv > 0 ? tb / tv : null;
    let acc = 0;
    const series = [];
    w20.forEach(k => {
      acc += (k.takerBuy || 0) * 2 - k.volume;
      series.push(acc);
    });
    cvdRising = series.length > 4 && series[series.length - 1] > series[series.length - 4];
  }

  // Average trade notional (large prints vs retail flow)
  const tradesArr = w20.map(k => k.trades || 0).filter(t => t > 0);
  const qv20 = w20.reduce((s, k) => s + (k.quoteVolume || k.volume * k.close || 0), 0);
  const avgTradeNotional = tradesArr.length >= 5
    ? qv20 / tradesArr.reduce((s, t) => s + t, 0)
    : null;

  // Distance from EMA21 measured in ATR units
  const atrVal = base.atrPercent ? (base.atrPercent / 100) * last.close : 0;
  const distAtr21 = atrVal > 0 ? (last.close - base.ema21) / atrVal : 0;

  // Distribution: higher high without OBV follow-through
  const obv = obvTrend(klines);
  const priorHigh20 = Math.max(...klines.slice(-20).map(k => k.high));
  const bearishDiv = last.high >= priorHigh20 && !obv.rising;

  // Volume fading on green candles
  const greens = klines.slice(-6).filter(k => k.close > k.open);
  const volFadeGreen = greens.length >= 3 &&
    greens[greens.length - 1].volume < mean(greens.slice(0, -1).map(k => k.volume)) * 0.7;

  return {
    valid: true,
    price: last.close,
    volumeZ: r1(volumeZ),
    seasonalZ: r1(seasonalZ),
    retZ: r1(retZ),
    bbWidthPct: r1(bbWidthPct),
    bbWidthPctPrev: r1(bbWidthPctPrev),
    squeezeRelease,
    clv: r1(clv * 100) / 100,
    upperWick: r1(upperWick * 100) / 100,
    closesNearHigh: r1(closesNearHigh * 100) / 100,
    absorption,
    amihud: r1(amihud),
    takerBuyRatio: takerBuyRatio != null ? r1(takerBuyRatio * 1000) / 1000 : null,
    cvdRising,
    obvRising: obv.rising,
    distAtr21: r1(distAtr21),
    bearishDiv,
    volFadeGreen,
    avgTradeNotional: avgTradeNotional != null ? Math.round(avgTradeNotional) : null,
  };
}

// --- Cascade triggers (5m trigger / 15m confirmation) ---
export function triggerFlags(micro) {
  if (!micro?.valid) return { trigger: false, confirm: false };
  const trigger = micro.volumeZ >= 2 || micro.absorption || (micro.retZ >= 1.5 && micro.volumeZ >= 1.2);
  const confirm = micro.volumeZ >= 1.5 || micro.absorption || (micro.squeezeRelease && micro.clv > 0.3) ||
    (micro.bbWidthPct <= 15 && micro.obvRising && micro.volumeZ >= 1);
  return { trigger, confirm };
}

// --- Two-axis score: Pump Strength + Manipulation Probability ---
export function scoreSignal({ base, micro, deriv, book, btcCtx, breadthPct, base4h, micro4h, liquidityUsd }) {
  const reasons = [];
  const priceUp = (base?.pumpPercent || 0) > 0;
  let strength = 0;

  if (micro?.volumeZ >= 3) { strength += 20; reasons.push("Volum anormal (z ≥ 3)"); }
  else if (micro?.volumeZ >= 2) { strength += 15; reasons.push("Volum anormal (z ≥ 2)"); }
  else if (micro?.volumeZ >= 1.5) { strength += 8; }

  if (micro?.seasonalZ >= 1.5) { strength += 10; reasons.push("Volum peste aceeași oră din zilele anterioare"); }

  if (deriv?.oiChangePct != null && priceUp) {
    if (deriv.oiChangePct >= 5) { strength += 15; reasons.push(`Open Interest +${deriv.oiChangePct.toFixed(1)}% (levier nou)`); }
    else if (deriv.oiChangePct >= 2) { strength += 10; reasons.push(`Open Interest +${deriv.oiChangePct.toFixed(1)}%`); }
  }
  if (deriv?.oiChangePct != null && deriv.oiChangePct <= -2 && priceUp) {
    reasons.push(`Open Interest ${deriv.oiChangePct.toFixed(1)}% (probabil short squeeze)`);
  }

  if (micro?.takerBuyRatio != null && micro.takerBuyRatio > 0.55 && micro.cvdRising) {
    strength += 15; reasons.push("Cumpărare agresivă (taker buy + CVD în creștere)");
  }
  if (micro?.absorption) { strength += 15; reasons.push("Absorbție: volum anormal fără mișcare de preț"); }
  if (micro?.squeezeRelease) { strength += 15; reasons.push("Breakout din compresie Bollinger"); }
  if (micro?.clv >= 0.5 && micro.upperWick < 0.25) { strength += 10; reasons.push("Închidere aproape de maxim cu volum"); }
  if (base?.volAccum) { strength += 8; }

  const aligned4h = !!base4h && base4h.trendOk && base4h.totalScore >= 40;
  const aligned1h = !!base?.trendOk && (base.pumpStatus !== "INACTIVE" || base.totalScore >= 45);
  const contextOk = aligned1h;
  if (aligned1h && aligned4h && base?.isTrending) { strength += 10; reasons.push("Trend aliniat 1h + 4h"); }
  if (base?.adxRising) strength += 5;

  // Excess return vs BTC (alpha) — a market-wide move is not a pump
  const alpha1h = btcCtx?.change1h != null ? (base.pumpPercent - btcCtx.change1h) : null;
  if (alpha1h != null) {
    if (alpha1h < 0.5) { strength -= 10; reasons.push("Mișcare explicată de BTC (fără alpha)"); }
    else if (alpha1h >= 3) { strength += 10; reasons.push(`Alpha vs BTC +${alpha1h.toFixed(1)}%`); }
  }
  strength = clamp(strength, 0, 100);

  // --- Manipulation probability ---
  let manipulation = 0;
  const manipReasons = [];

  if (micro?.amihud >= 0.8) { manipulation += 20; manipReasons.push("Lichiditate subțire (impact mare per $1M)"); }
  else if (micro?.amihud >= 0.4) { manipulation += 10; }

  if (deriv?.perpSpotRatio >= 10) { manipulation += 20; manipReasons.push(`Perp ${deriv.perpSpotRatio.toFixed(1)}× spot (speculativ)`); }
  else if (deriv?.perpSpotRatio >= 5) { manipulation += 10; }

  if (deriv?.oiChangePct != null && deriv.oiChangePct >= 5 && Math.abs(base?.pumpPercent || 0) < 2) {
    manipulation += 15; manipReasons.push("Open Interest explodează cu prețul plat");
  }
  if (micro?.retZ >= 1.5 && micro?.cvdRising === false) {
    manipulation += 20; manipReasons.push("Preț în sus fără cumpărare reală (CVD divergent)");
  }
  if (deriv?.fundingRate != null && deriv.fundingRate >= 0.1) { manipulation += 15; manipReasons.push(`Funding extrem ${deriv.fundingRate.toFixed(3)}%/8h`); }
  else if (deriv?.fundingRate != null && deriv.fundingRate >= 0.05) { manipulation += 8; }

  if (book?.imbalance != null && (book.imbalance >= 0.7 || book.imbalance <= 0.3)) {
    manipulation += 10; manipReasons.push("Order book dezechilibrat (±2%)");
  }
  if (micro?.avgTradeNotional != null && micro.avgTradeNotional > 50000 && micro.volumeZ >= 2) {
    manipulation += 15; manipReasons.push("Volum mare din puține tranzacții mari (posibil wash/balene)");
  }
  if (liquidityUsd != null && liquidityUsd < 2000000) manipulation += 10;

  // Market-wide move is not single-coin manipulation
  if (breadthPct != null && breadthPct > 30) {
    manipulation -= 15;
    manipReasons.push(`Mișcare de piață (${Math.round(breadthPct)}% din perechi pe plus)`);
  }
  manipulation = clamp(manipulation, 0, 100);

  // --- Distribution / dump risk ---
  const dumpFactors = [];
  if (base?.rsi >= 80 && micro?.bearishDiv) dumpFactors.push("RSI > 80 cu divergență bearish");
  if (base?.bbUpper && micro?.price > base.bbUpper && micro.upperWick >= 0.35) dumpFactors.push("Peste banda superioară cu mecheri lungi");
  if (micro?.volFadeGreen) dumpFactors.push("Volum în scădere pe lumânări verzi");
  if (deriv?.fundingRate != null && deriv.fundingRate >= 0.1 && deriv?.oiChangePct != null && deriv.oiChangePct < 0) {
    dumpFactors.push("Funding extrem + OI în scădere");
  }
  if (micro?.distAtr21 >= 3) dumpFactors.push(`Distanță ${micro.distAtr21.toFixed(1)}× ATR față de EMA21`);

  return {
    strength,
    manipulation,
    alpha1h: r1(alpha1h),
    contextOk,
    aligned4h,
    dumpRisk: dumpFactors.length >= 2,
    dumpFactors,
    manipReasons,
    reasons,
  };
}

// --- Final status from the cascade ---
export function resolveStatus({ trigger, confirm, contextOk, strength, dumpRisk, baseEarly }) {
  if (dumpRisk) return { status: "DUMP_RISK", emoji: "☠️" };
  if (trigger && confirm && contextOk && strength >= 70) return { status: "STRONG", emoji: "🔥" };
  if (trigger && confirm && contextOk && strength >= 45) return { status: "ACTIVE", emoji: "📈" };
  if (trigger && confirm) return { status: "EARLY", emoji: "🔔" };
  if (trigger) return { status: "WATCH", emoji: "👀" };
  if (baseEarly && contextOk) return { status: "EARLY", emoji: "🔔" };
  if (contextOk && strength >= 45) return { status: "ACTIVE", emoji: "📈" };
  return { status: "INACTIVE", emoji: "⚫" };
}

// Convenience: legacy statuses mapped onto the new ones (for pairs not deep-scanned)
export function legacyStatus(base) {
  const map = { STRONG: "STRONG", ACTIVE: "ACTIVE", WEAK: "WATCH", EARLY: "EARLY", INACTIVE: "INACTIVE" };
  const emojis = { STRONG: "🔥", ACTIVE: "📈", WATCH: "👀", EARLY: "🔔", INACTIVE: "⚫" };
  const status = map[base?.pumpStatus] || "INACTIVE";
  return { status, emoji: base?.pumpEmoji || emojis[status] };
}

export { analyzePump };