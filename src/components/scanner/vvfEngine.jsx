// sosoVVF Composite TRON - JS confirmation layer (adaptat din indicatorul TradingView)
// Rol: filtru de confirmare care aprobă/blochează semnalele Pump Detective

function ema(data, period) {
  if (data.length < 2) return data[data.length - 1] || 0;
  const k = 2 / (period + 1);
  let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) val = data[i] * k + val * (1 - k);
  return val;
}

function rsi(closes, period = 14) {
  if (closes.length < period * 2) return 50;
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  if (!avgLoss) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Detectează un Fair Value Gap (bull/bear) nemitigat în ultimele `lookback` bare
function detectFVG(highs, lows, n, lookback = 20) {
  let bullFvg = "NONE"; // NONE | FRESH | PARTIAL
  let bearFvg = "NONE";
  const start = Math.max(2, n - lookback);
  for (let i = n - 1; i >= start; i--) {
    if (bullFvg === "NONE" && lows[i] > highs[i - 2]) {
      const gapHigh = lows[i];
      let mitigated = false, touched = false;
      for (let j = i + 1; j < n; j++) {
        if (lows[j] <= highs[i - 2]) { mitigated = true; break; }
        if (lows[j] <= gapHigh) touched = true;
      }
      if (!mitigated) bullFvg = touched ? "PARTIAL" : "FRESH";
    }
    if (bearFvg === "NONE" && highs[i] < lows[i - 2]) {
      const gapLow = highs[i];
      let mitigated = false, touched = false;
      for (let j = i + 1; j < n; j++) {
        if (highs[j] >= lows[i - 2]) { mitigated = true; break; }
        if (highs[j] >= gapLow) touched = true;
      }
      if (!mitigated) bearFvg = touched ? "PARTIAL" : "FRESH";
    }
    if (bullFvg !== "NONE" && bearFvg !== "NONE") break;
  }
  return { bullFvg, bearFvg };
}

// --- Analiză principală sosoVVF ---
export function analyzeVVF(klines) {
  if (!klines || klines.length < 30) return getEmptyVVF();

  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const opens = klines.map(k => k.open);
  const volumes = klines.map(k => k.volume);
  const n = closes.length;
  const lastClose = closes[n - 1];

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, Math.min(50, n - 1));
  const rsiVal = rsi(closes);
  const volSma20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, n) || 1;
  const volumeRatio = volumes[n - 1] / volSma20;

  // --- FVG (Fair Value Gap) ---
  const { bullFvg, bearFvg } = detectFVG(highs, lows, n);
  const hasBullFvg = bullFvg !== "NONE";
  const hasBearFvg = bearFvg !== "NONE";

  // --- Manipulation Score: mărimea mediei wick-urilor pe ultimele 10 bare ---
  const recentN = Math.min(10, n);
  let wickSum = 0, rangeSum = 0;
  for (let i = n - recentN; i < n; i++) {
    const range = highs[i] - lows[i];
    const body = Math.abs(closes[i] - opens[i]);
    wickSum += Math.max(0, range - body);
    rangeSum += range;
  }
  const manipulationScore = rangeSum > 0 ? Math.min(100, (wickSum / rangeSum) * 100) : 0;

  // --- Liquidity Heat: cât de aproape e prețul de extremele recente (swing high/low) ---
  const swingHigh = Math.max(...highs.slice(-50));
  const swingLow = Math.min(...lows.slice(-50));
  const distToHigh = lastClose > 0 ? ((swingHigh - lastClose) / lastClose) * 100 : 100;
  const distToLow = lastClose > 0 ? ((lastClose - swingLow) / lastClose) * 100 : 100;
  const minDist = Math.min(distToHigh, distToLow);
  const liquidityHeat = Math.max(0, Math.min(100, 100 - minDist * 20));

  // --- Vulnerability: RSI extrem + volum scăzut ---
  let vulnerability = 0;
  if (rsiVal >= 75 || rsiVal <= 25) vulnerability += 50;
  if (volumeRatio < 0.7) vulnerability += 30;
  vulnerability = Math.min(100, vulnerability);

  // --- Unified Score (-100..100): trend + momentum + rsi ---
  const trendComponent = lastClose > ema50 ? 30 : -30;
  const momentumComponent = ema9 > ema21 ? 30 : -30;
  const rsiComponent = ((rsiVal - 50) / 50) * 40;
  const unifiedScore = Math.max(-100, Math.min(100, trendComponent + momentumComponent + rsiComponent));

  // --- Bull/Bear Confirm % ---
  const bullChecklist = [ema9 > ema21, lastClose > ema50, rsiVal > 50, volumeRatio > 1, !hasBearFvg];
  const bearChecklist = [ema9 < ema21, lastClose < ema50, rsiVal < 50, volumeRatio > 1, !hasBullFvg];
  const bullConfirmPct = (bullChecklist.filter(Boolean).length / bullChecklist.length) * 100;
  const bearConfirmPct = (bearChecklist.filter(Boolean).length / bearChecklist.length) * 100;

  const marketPhase = unifiedScore > 20 ? "BULLISH" : unifiedScore < -20 ? "BEARISH" : "NEUTRAL";

  return {
    hasBullFvg, hasBearFvg, bullFvg, bearFvg,
    manipulationScore: Math.round(manipulationScore),
    liquidityHeat: Math.round(liquidityHeat),
    vulnerability: Math.round(vulnerability),
    unifiedScore: Math.round(unifiedScore),
    bullConfirmPct: Math.round(bullConfirmPct),
    bearConfirmPct: Math.round(bearConfirmPct),
    marketPhase,
  };
}

function getEmptyVVF() {
  return {
    hasBullFvg: false, hasBearFvg: false, bullFvg: "NONE", bearFvg: "NONE",
    manipulationScore: 0, liquidityHeat: 0, vulnerability: 0,
    unifiedScore: 0, bullConfirmPct: 0, bearConfirmPct: 0, marketPhase: "NEUTRAL",
  };
}

// --- Aprobare VVF pentru o direcție (BUY/SELL) ---
export function getVVFApproval(direction, vvf, config = {}) {
  const {
    useVvfConfirmation = true,
    vvfMinConfidence = 60,
    vvfMinUnifiedScore = 25,
    vvfRequireBullFvg = true,
    vvfRequireBearFvg = true,
    vvfBlockManipulation = true,
    vvfBlockLiquidityHeat = true,
    vvfBlockVulnerability = true,
  } = config;

  if (!useVvfConfirmation) return { approved: true, confidence: 100, reason: "VVF OFF" };

  let approved = true;
  let reason = "✅ VVF PASSED";

  if (direction === "BUY") {
    if (vvf.unifiedScore < vvfMinUnifiedScore) { approved = false; reason = `❌ Unified Score scăzut: ${vvf.unifiedScore}`; }
    else if (vvf.bullConfirmPct < vvfMinConfidence) { approved = false; reason = `❌ Bull Confidence scăzut: ${vvf.bullConfirmPct}%`; }
    else if (vvfRequireBullFvg && !vvf.hasBullFvg) { approved = false; reason = "❌ Fără Bull FVG"; }
  } else {
    if (vvf.unifiedScore > -vvfMinUnifiedScore) { approved = false; reason = `❌ Bear Unified Score scăzut: ${vvf.unifiedScore}`; }
    else if (vvf.bearConfirmPct < vvfMinConfidence) { approved = false; reason = `❌ Bear Confidence scăzut: ${vvf.bearConfirmPct}%`; }
    else if (vvfRequireBearFvg && !vvf.hasBearFvg) { approved = false; reason = "❌ Fără Bear FVG"; }
  }

  if (approved && vvfBlockManipulation && vvf.manipulationScore > 50) { approved = false; reason = `❌ Manipulation: ${vvf.manipulationScore}%`; }
  if (approved && vvfBlockLiquidityHeat && vvf.liquidityHeat > 70) { approved = false; reason = `❌ Liquidity Heat: ${vvf.liquidityHeat}%`; }
  if (approved && vvfBlockVulnerability && vvf.vulnerability > 50) { approved = false; reason = `❌ Vulnerability: ${vvf.vulnerability}%`; }

  const confidence = direction === "BUY"
    ? Math.min(100, vvf.unifiedScore * 0.3 + vvf.bullConfirmPct * 0.7)
    : Math.min(100, Math.abs(vvf.unifiedScore) * 0.3 + vvf.bearConfirmPct * 0.7);

  return { approved, confidence: Math.round(confidence), reason };
}