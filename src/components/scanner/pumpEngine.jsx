// SOSO PUMP Detective Engine - v3.2 (precision fixes)

// --- Wilder's RMA (Running Moving Average) - used by RSI, ADX ---
function rma(data, period) {
  if (data.length < period) return null;
  let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    val = (val * (period - 1) + data[i]) / period;
  }
  return val;
}

function sma(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(data, period) {
  if (data.length < 2) return data[data.length - 1] || 0;
  const k = 2 / (period + 1);
  let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    val = data[i] * k + val * (1 - k);
  }
  return val;
}

// Wilder's RSI - proper implementation
function rsi(closes, period = 14) {
  if (closes.length < period * 2) return 50;
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const avgGain = rma(gains, period);
  const avgLoss = rma(losses, period);
  if (!avgGain || !avgLoss || avgLoss === 0) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return 0;
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  return rma(trs, period) || 0;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal + 5) return { macdLine: 0, signalLine: 0, histogram: 0, bullishCross: false };

  // Compute MACD line history incrementally
  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);
  let emaF = closes.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let emaS = closes.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  const macdHistory = [];
  for (let i = Math.max(fast, slow); i < closes.length; i++) {
    emaF = closes[i] * kFast + emaF * (1 - kFast);
    emaS = closes[i] * kSlow + emaS * (1 - kSlow);
    macdHistory.push(emaF - emaS);
  }

  if (macdHistory.length < signal + 2) return { macdLine: 0, signalLine: 0, histogram: 0, bullishCross: false };

  // Signal line as EMA of MACD history
  const kSig = 2 / (signal + 1);
  let sigLine = macdHistory.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
  let prevSigLine = sigLine;
  let prevMacd = macdHistory[signal - 1];
  for (let i = signal; i < macdHistory.length; i++) {
    prevSigLine = sigLine;
    prevMacd = macdHistory[i - 1];
    sigLine = macdHistory[i] * kSig + sigLine * (1 - kSig);
  }

  const macdLine = macdHistory[macdHistory.length - 1];
  const bullishCross = prevMacd <= prevSigLine && macdLine > sigLine;

  return { macdLine, signalLine: sigLine, histogram: macdLine - sigLine, bullishCross };
}

function bollingerBands(closes, length = 20, mult = 2.0) {
  if (closes.length < length * 2) return { upper: 0, middle: 0, lower: 0, width: 0, isSqueeze: false };

  // Compute width history for squeeze detection
  const widths = [];
  for (let i = length; i <= closes.length; i++) {
    const sl = closes.slice(i - length, i);
    const m = sl.reduce((a, b) => a + b, 0) / length;
    const std = Math.sqrt(sl.reduce((a, b) => a + Math.pow(b - m, 2), 0) / length);
    widths.push(m > 0 ? (mult * 2 * std) / m : 0);
  }

  const currentWidth = widths[widths.length - 1];
  const avgWidth = sma(widths, Math.min(length, widths.length)) || currentWidth;
  const sl = closes.slice(-length);
  const middle = sl.reduce((a, b) => a + b, 0) / length;
  const std = Math.sqrt(sl.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / length);

  return {
    upper: middle + mult * std,
    middle,
    lower: middle - mult * std,
    width: currentWidth,
    avgWidth,
    isSqueeze: currentWidth < avgWidth * 0.8,
  };
}

// Proper ADX with Wilder smoothing
function adx(highs, lows, closes, period = 14) {
  if (highs.length < period * 3) return { adx: 0, plusDI: 0, minusDI: 0, rising: false };

  const plusDMs = [], minusDMs = [], trs = [];
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }

  const smTR = rma(trs, period) || 1;
  const smPlus = rma(plusDMs, period) || 0;
  const smMinus = rma(minusDMs, period) || 0;

  const plusDI = (smPlus / smTR) * 100;
  const minusDI = (smMinus / smTR) * 100;
  const dx = (plusDI + minusDI) > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;

  // Compute DX history then smooth with RMA for real ADX
  const dxHistory = [];
  for (let j = period; j < trs.length; j++) {
    const sTR = rma(trs.slice(0, j + 1), period) || 1;
    const sP = rma(plusDMs.slice(0, j + 1), period) || 0;
    const sM = rma(minusDMs.slice(0, j + 1), period) || 0;
    const pDI = (sP / sTR) * 100;
    const mDI = (sM / sTR) * 100;
    dxHistory.push((pDI + mDI) > 0 ? (Math.abs(pDI - mDI) / (pDI + mDI)) * 100 : 0);
  }

  const adxVal = dxHistory.length >= period ? rma(dxHistory, period) || dx : dx;
  const prevAdx = dxHistory.length >= period + 1 ? rma(dxHistory.slice(0, -1), period) || adxVal : adxVal;

  return {
    adx: adxVal,
    plusDI,
    minusDI,
    rising: adxVal > prevAdx && plusDI > minusDI,
  };
}

function obv(closes, volumes) {
  let obvVal = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obvVal += volumes[i];
    else if (closes[i] < closes[i - 1]) obvVal -= volumes[i];
  }
  return obvVal;
}

// --- Main Pump Analysis ---
export function analyzePump(klines, config = {}) {
  const {
    pump_threshold = 15,
    volume_multiplier = 2.5,
    lookback_bars = 20,
    use_volume_accumulation = true,
    vol_accum_threshold = 1.3,
    use_macd_confirmation = true,
    use_bb_squeeze = true,
    use_adx_filter = true,
    use_obv_divergence = true,
    use_trend_filter = true,
    bb_length = 20,
    bb_mult = 2.0,
    adx_threshold = 20,
    noise_filter = true,
    noise_threshold = 0.5,
    use_market_regime = true,
    exhaustion_rsi = 75
  } = config;

  if (!klines || klines.length < 60) return getEmptyResult();

  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);
  const lastClose = closes[closes.length - 1];
  const n = closes.length;

  // --- Pump Percentage ---
  const lookback = Math.min(lookback_bars, n - 1);
  const prevClose = closes[n - 1 - lookback];
  const pumpPercent = prevClose > 0 ? ((lastClose - prevClose) / prevClose) * 100 : 0;

  // --- Volume Analysis ---
  const volSma20 = sma(volumes, 20) || 1;
  const lastVolume = volumes[n - 1];
  const volumeSpikeVal = lastVolume / volSma20;
  const volumeSpike = volumeSpikeVal > volume_multiplier;

  // --- Volume Accumulation (SMA5 vs SMA20) ---
  const volSma5 = sma(volumes.slice(-5), 5) || 0;
  const volAccum = use_volume_accumulation && volSma5 > volSma20 * vol_accum_threshold;

  // --- RSI (Wilder) ---
  const rsiVal = rsi(closes);

  // --- ATR & Noise ---
  const atrVal = atr(highs, lows, closes);
  const atrPercent = lastClose > 0 ? (atrVal / lastClose) * 100 : 0;
  const isNoisy = noise_filter && atrPercent < noise_threshold;

  // --- EMAs ---
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, Math.min(200, n - 1));

  // FIXED: proper bullish momentum — price above short EMAs AND ema9 > ema21
  const emaBullish = ema9 > ema21 && lastClose > ema9;

  // --- MACD (incremental, accurate) ---
  const macdResult = macd(closes);
  const macdBullish = use_macd_confirmation ? (macdResult.bullishCross || macdResult.macdLine > 0) : true;

  // --- Bollinger Bands (proper historical squeeze) ---
  const bb = bollingerBands(closes, bb_length, bb_mult);
  const isSqueeze = use_bb_squeeze && bb.isSqueeze;

  // --- ADX (proper Wilder smoothing) ---
  const adxResult = adx(highs, lows, closes);
  const isAdxRising = use_adx_filter && adxResult.adx > adx_threshold && adxResult.rising;
  const isAdxStrong = adxResult.adx > adx_threshold;

  // --- OBV Divergence (bullish: OBV rising while price making higher low) ---
  const lookbackObv = Math.min(20, n - 2);
  const obvCurrent = obv(closes, volumes);
  const obvPrev = obv(closes.slice(0, -lookbackObv), volumes.slice(0, -lookbackObv));
  const priceLow = Math.min(...lows.slice(-lookbackObv));
  const prevLow = Math.min(...lows.slice(-lookbackObv * 2, -lookbackObv));
  // Bullish: OBV rising + price low is higher (accumulation)
  const obvDivergence = use_obv_divergence && obvCurrent > obvPrev && priceLow >= prevLow * 0.98;

  // --- Market Regime ---
  const isTrending = adxResult.adx > 25 && adxResult.plusDI > adxResult.minusDI;
  const isRanging = adxResult.adx < 20 && bb.isSqueeze;
  const marketRegime = isTrending ? "TRENDING" : isRanging ? "RANGING" : "MIXED";

  // --- Effective Threshold ---
  let effectiveThreshold = pump_threshold;
  if (use_market_regime && isRanging) effectiveThreshold *= 1.5;

  // --- Trend Filter ---
  const trendOk = !use_trend_filter || (lastClose > ema200 && lastClose > ema50);

  // --- Scoring System (0-100) ---
  // Volume (35pts max)
  const volScore = (volAccum ? 20 : 0) + (volumeSpike ? 15 : 0);
  // Momentum (25pts max)
  const momentumScore = (emaBullish ? 15 : 0) + (macdBullish ? 10 : 0);
  // Advanced (35pts max)
  const advancedScore = (obvDivergence ? 10 : 0) + (isSqueeze ? 15 : 0) + (isAdxRising ? 10 : 0);
  // Trend quality (10pts)
  const trendScore = trendOk ? (isTrending ? 10 : 5) : 0;

  const baseScore = Math.min(100, volScore + momentumScore + advancedScore + trendScore);

  // Pump confirmation bonus
  const pumpBonus = volumeSpike && pumpPercent >= effectiveThreshold * 0.5 ? 15 : 0;
  const totalScore = Math.min(100, baseScore + pumpBonus);

  // --- Pump Active ---
  const pumpActive = pumpPercent >= effectiveThreshold * 0.5 && volumeSpike && trendOk && !isNoisy && isAdxStrong;

  // --- Early Warning ---
  let earlyWarningScore = 0;
  if (volAccum) earlyWarningScore += 25;
  if (emaBullish) earlyWarningScore += 25;
  if (macdBullish) earlyWarningScore += 20;
  if (obvDivergence) earlyWarningScore += 20;
  if (isSqueeze) earlyWarningScore += 20;
  if (isAdxRising) earlyWarningScore += 15;
  const hasEarlyWarning = earlyWarningScore >= 50 && trendOk && !isNoisy;

  // --- Pump Status ---
  let pumpStatus = "INACTIVE";
  let pumpEmoji = "⚫";
  if (pumpActive && totalScore >= 70) { pumpStatus = "STRONG"; pumpEmoji = "🔥"; }
  else if (pumpActive && totalScore >= 45) { pumpStatus = "ACTIVE"; pumpEmoji = "📈"; }
  else if (pumpActive) { pumpStatus = "WEAK"; pumpEmoji = "⚠️"; }
  else if (hasEarlyWarning) { pumpStatus = "EARLY"; pumpEmoji = "🔔"; }

  // --- Exit Signals ---
  const rsiExtreme = rsiVal >= exhaustion_rsi;
  const volumeFade = lastVolume < volSma20 * 0.5;

  return {
    pumpPercent: Math.round(pumpPercent * 100) / 100,
    volumeSpikeVal: Math.round(volumeSpikeVal * 10) / 10,
    volumeSpike,
    volAccum,
    rsi: Math.round(rsiVal),
    atrPercent: Math.round(atrPercent * 100) / 100,
    isNoisy,
    ema9, ema21, ema50, ema200,
    emaCross: emaBullish,
    macdBullish,
    macdHistogram: macdResult.histogram,
    bbUpper: bb.upper,
    bbLower: bb.lower,
    bbMiddle: bb.middle,
    bbWidth: bb.width,
    isSqueeze,
    adx: Math.round(adxResult.adx),
    adxRising: isAdxRising,
    plusDI: Math.round(adxResult.plusDI),
    minusDI: Math.round(adxResult.minusDI),
    obvDivergence,
    marketRegime,
    isTrending,
    isRanging,
    trendOk,
    pumpActive,
    totalScore: Math.round(totalScore),
    earlyWarningScore,
    hasEarlyWarning,
    pumpStatus,
    pumpEmoji,
    volScore,
    momentumScore,
    advancedScore,
    rsiExtreme,
    volumeFade,
    exitSignals: {
      rsiExtreme,
      volumeFade,
      adxExhaustion: adxResult.adx > 30 && !adxResult.rising
    }
  };
}

function getEmptyResult() {
  return {
    pumpPercent: 0, volumeSpikeVal: 0, volumeSpike: false, volAccum: false,
    rsi: 50, atrPercent: 0, isNoisy: false, emaCross: false, macdBullish: false,
    macdHistogram: 0, bbUpper: 0, bbLower: 0, bbMiddle: 0, bbWidth: 0,
    isSqueeze: false, adx: 0, adxRising: false, plusDI: 0, minusDI: 0, obvDivergence: false,
    marketRegime: "MIXED", isTrending: false, isRanging: false, trendOk: false,
    pumpActive: false, totalScore: 0, earlyWarningScore: 0, hasEarlyWarning: false,
    pumpStatus: "INACTIVE", pumpEmoji: "⚫", volScore: 0, momentumScore: 0,
    advancedScore: 0, rsiExtreme: false, volumeFade: false,
    exitSignals: { rsiExtreme: false, volumeFade: false, adxExhaustion: false }
  };
}