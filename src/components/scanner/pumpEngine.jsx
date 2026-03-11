// SOSO PUMP Detective Engine - ported from PineScript v3.1

// --- Technical Indicators ---
function sma(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(data, period) {
  if (data.length < 2) return data[data.length - 1] || 0;
  const k = 2 / (period + 1);
  let emaVal = data[0];
  for (let i = 1; i < data.length; i++) {
    emaVal = data[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function atr(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return 0;
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  return sma(trs.slice(-period), period) || 0;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return { macdLine: 0, signalLine: 0, histogram: 0, bullishCross: false };
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast - emaSlow;
  
  // Simplified - calculate MACD line history for signal
  const macdHistory = [];
  for (let i = slow; i < closes.length; i++) {
    const ef = ema(closes.slice(0, i + 1), fast);
    const es = ema(closes.slice(0, i + 1), slow);
    macdHistory.push(ef - es);
  }
  
  const signalLine = macdHistory.length >= signal ? ema(macdHistory, signal) : 0;
  const prevSignal = macdHistory.length >= signal + 1 ? ema(macdHistory.slice(0, -1), signal) : 0;
  const prevMacd = macdHistory.length >= 2 ? macdHistory[macdHistory.length - 2] : 0;
  
  return {
    macdLine,
    signalLine,
    histogram: macdLine - signalLine,
    bullishCross: prevMacd <= prevSignal && macdLine > signalLine
  };
}

function bollingerBands(closes, length = 20, mult = 2.0) {
  if (closes.length < length) return { upper: 0, middle: 0, lower: 0, width: 0, squeeze: false };
  const slice = closes.slice(-length);
  const middle = slice.reduce((a, b) => a + b, 0) / length;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / length);
  const upper = middle + mult * std;
  const lower = middle - mult * std;
  const width = middle > 0 ? (upper - lower) / middle : 0;
  
  // Check squeeze - compare current width to average width
  return { upper, middle, lower, width, std };
}

function adx(highs, lows, closes, period = 14) {
  if (highs.length < period * 2) return { adx: 0, plusDI: 0, minusDI: 0, rising: false };
  
  const plusDMs = [], minusDMs = [], trs = [];
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  
  const smoothTR = sma(trs.slice(-period), period) || 1;
  const smoothPlusDM = sma(plusDMs.slice(-period), period) || 0;
  const smoothMinusDM = sma(minusDMs.slice(-period), period) || 0;
  
  const plusDI = (smoothPlusDM / smoothTR) * 100;
  const minusDI = (smoothMinusDM / smoothTR) * 100;
  const dx = (plusDI + minusDI) > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;
  
  // Simple ADX approximation
  const adxVal = dx;
  const prevPlusDI = plusDMs.length > period + 3 ? (sma(plusDMs.slice(-period - 3, -3), period) / (sma(trs.slice(-period - 3, -3), period) || 1)) * 100 : plusDI;
  
  return { adx: adxVal, plusDI, minusDI, rising: adxVal > 20 && plusDI > prevPlusDI };
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
    bb_squeeze_threshold = 0.8,
    adx_threshold = 20,
    noise_filter = true,
    noise_threshold = 0.5,
    use_market_regime = true,
    exhaustion_rsi = 75
  } = config;

  if (!klines || klines.length < 50) {
    return getEmptyResult();
  }

  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);
  const lastClose = closes[closes.length - 1];
  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];

  // --- Pump Percentage ---
  const lookback = Math.min(lookback_bars, closes.length - 1);
  const prevClose = closes[closes.length - 1 - lookback];
  const pumpPercent = prevClose > 0 ? ((lastClose - prevClose) / prevClose) * 100 : 0;

  // --- Volume Analysis ---
  const volSma20 = sma(volumes, 20) || 1;
  const lastVolume = volumes[volumes.length - 1];
  const volumeSpikeVal = lastVolume / volSma20;
  const volumeSpike = volumeSpikeVal > volume_multiplier;

  // --- Volume Accumulation ---
  const volSma5 = sma(volumes.slice(-5), 5) || 0;
  const volAccum = use_volume_accumulation && volSma5 > volSma20 * vol_accum_threshold;

  // --- RSI ---
  const rsiVal = rsi(closes);

  // --- ATR & Noise ---
  const atrVal = atr(highs, lows, closes);
  const atrPercent = lastClose > 0 ? (atrVal / lastClose) * 100 : 0;
  const isNoisy = noise_filter && atrPercent < noise_threshold;

  // --- EMA ---
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema200 = ema(closes, 200);
  const emaCross = lastClose > ema9 || ema9 > ema21;

  // --- MACD ---
  const macdResult = macd(closes);
  const macdBullish = use_macd_confirmation ? macdResult.bullishCross : true;

  // --- Bollinger Bands ---
  const bb = bollingerBands(closes, bb_length, bb_mult);
  const bbSmaWidth = sma(
    closes.slice(-bb_length * 2).map((_, i, arr) => {
      if (i < bb_length) return bb.width;
      const sl = arr.slice(i - bb_length, i);
      const m = sl.reduce((a, b) => a + b, 0) / bb_length;
      const s = Math.sqrt(sl.reduce((a, b) => a + Math.pow(b - m, 2), 0) / bb_length);
      return m > 0 ? (2 * bb_mult * s) / m : 0;
    }),
    bb_length
  ) || bb.width;
  const isSqueeze = use_bb_squeeze && bb.width < bbSmaWidth * bb_squeeze_threshold;

  // --- ADX ---
  const adxResult = adx(highs, lows, closes);
  const isAdxRising = use_adx_filter && adxResult.adx > adx_threshold && adxResult.rising;

  // --- OBV ---
  const obvVal = obv(closes, volumes);
  const obvPrev = obv(closes.slice(0, -14), volumes.slice(0, -14));
  const obvDivergence = use_obv_divergence && obvVal > obvPrev && lastClose < closes[closes.length - 15];

  // --- Market Regime ---
  const isTrending = adxResult.adx > 25;
  const isRanging = adxResult.adx < 20 && bb.width < bbSmaWidth * 0.8;
  const marketRegime = isTrending ? "TRENDING" : isRanging ? "RANGING" : "MIXED";

  // --- Effective Thresholds ---
  let effectiveThreshold = pump_threshold;
  if (use_market_regime && isRanging) effectiveThreshold *= 1.5;

  // --- Trend Filter ---
  const trendOk = !use_trend_filter || lastClose > ema200;

  // --- Scoring System (0-100) ---
  const volScore = (volAccum ? 20 : 0) + (volumeSpike ? 15 : 0);
  const momentumScore = (emaCross ? 15 : 0) + (macdBullish ? 10 : 0);
  const advancedScore = (obvDivergence ? 10 : 0) + (isSqueeze ? 15 : 0) + (isAdxRising ? 10 : 0);
  const trendScore = trendOk ? 10 : 0;
  const regimeScore = use_market_regime ? (isTrending ? 10 : isRanging ? 5 : 7) : 0;

  // Pump active on current TF
  const adjustedThreshold = volAccum ? effectiveThreshold * 0.8 : effectiveThreshold;
  const pumpActive = pumpPercent >= adjustedThreshold && volumeSpike && trendOk && !isNoisy;
  const pumpTFScore = pumpActive ? 30 : (pumpPercent >= effectiveThreshold * 0.5 ? 15 : 0);

  const totalScore = Math.min(100, volScore + momentumScore + advancedScore + pumpTFScore + trendScore + regimeScore);

  // --- Early Warning ---
  let earlyWarningScore = 0;
  if (volAccum) earlyWarningScore += 25;
  if (emaCross) earlyWarningScore += 25;
  if (macdBullish) earlyWarningScore += 25;
  if (obvDivergence) earlyWarningScore += 25;
  if (isSqueeze) earlyWarningScore += 20;
  if (isAdxRising) earlyWarningScore += 15;

  const hasEarlyWarning = earlyWarningScore >= 50 && trendOk && !isNoisy;

  // --- Pump Status ---
  let pumpStatus = "INACTIVE";
  let pumpEmoji = "⚫";
  if (pumpActive && totalScore >= 70) { pumpStatus = "STRONG"; pumpEmoji = "🔥"; }
  else if (pumpActive && totalScore >= 40) { pumpStatus = "ACTIVE"; pumpEmoji = "📈"; }
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
    ema9, ema21, ema200,
    emaCross,
    macdBullish,
    macdHistogram: macdResult.histogram,
    bbUpper: bb.upper,
    bbLower: bb.lower,
    bbMiddle: bb.middle,
    bbWidth: bb.width,
    isSqueeze,
    adx: Math.round(adxResult.adx),
    adxRising: isAdxRising,
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
    isSqueeze: false, adx: 0, adxRising: false, obvDivergence: false,
    marketRegime: "MIXED", isTrending: false, isRanging: false, trendOk: false,
    pumpActive: false, totalScore: 0, earlyWarningScore: 0, hasEarlyWarning: false,
    pumpStatus: "INACTIVE", pumpEmoji: "⚫", volScore: 0, momentumScore: 0,
    advancedScore: 0, rsiExtreme: false, volumeFade: false,
    exitSignals: { rsiExtreme: false, volumeFade: false, adxExhaustion: false }
  };
}