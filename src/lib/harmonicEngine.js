// SOSO Harmonic Pattern Detector — JS port of the Pine v6 "Soso Harmonic Pattern Detector".
// Pure functions over an OHLCV klines array (same shape used by the scanner: {open,high,low,close,time}).
// Detects Gartley, Bat, Alt Bat, Crab, Deep Crab, Butterfly, Cypher, AB=CD, Shark, 5-0 patterns
// with Fibonacci ratio scoring, PRZ (Potential Reversal Zone), grade and R:R trade levels.

// Pattern ratio ranges: [ABlo, ABhi, BClo, BChi, CDlo, CDhi, ADlo, ADhi]
const PATTERN_RANGES = [
  [0.59, 0.65, 0.382, 0.886, 1.13, 1.618, 0.75, 0.82],     // 0 GARTLEY
  [0.382, 0.50, 0.382, 0.886, 1.618, 2.618, 0.86, 0.91],   // 1 BAT
  [0.35, 0.40, 0.382, 0.886, 2.00, 3.618, 1.10, 1.16],     // 2 ALT BAT
  [0.382, 0.618, 0.382, 0.886, 2.244, 3.618, 1.55, 1.68],  // 3 CRAB
  [0.85, 0.92, 0.382, 0.886, 2.244, 3.618, 1.58, 1.66],   // 4 DEEP CRAB
  [0.76, 0.81, 0.382, 0.886, 1.618, 2.618, 1.272, 1.618], // 5 BUTTERFLY
  [0.382, 0.618, 1.13, 1.414, 0.70, 0.87, 0.0, 0.0],       // 6 CYPHER (uses XC / CD-of-XC)
  [0.0, 10.0, 0.382, 0.886, 0.85, 1.65, 0.0, 10.0],        // 7 AB=CD
  [0.886, 1.13, 1.13, 1.618, 0.45, 0.62, 0.886, 1.13],     // 8 SHARK
  [1.13, 1.618, 1.618, 2.24, 0.45, 0.55, 0.0, 10.0],       // 9 5-0
];
const PATTERN_NAMES = ["GARTLEY", "BAT", "ALT BAT", "CRAB", "DEEP CRAB", "BUTTERFLY", "CYPHER", "AB=CD", "SHARK", "5-0"];

const DEFAULT_TOL = 0.035;

export const PIVOT_PRESETS = {
  fast:   { left: 5, right: 1 },
  normal: { left: 10, right: 3 },
  slow:   { left: 21, right: 5 },
};

// Score how close a ratio sits to its ideal band (0..1).
function scoreRatio(v, lo, hi) {
  const mid = (lo + hi) / 2;
  const span = Math.max(0.08, (hi - lo) / 2 + 0.08);
  return Math.max(0.0, 1.0 - Math.abs(v - mid) / span);
}
function inRange(v, lo, hi, tol = DEFAULT_TOL) {
  return v >= lo - tol && v <= hi + tol;
}
function gradeOf(conf) {
  return conf >= 75 ? "A+" : conf >= 65 ? "A" : conf >= 55 ? "B" : conf >= 45 ? "C" : "D";
}

// Build an alternating zigzag of pivots from klines.
// Returns: [{ price, barIndex, dir }] with dir = 1 (high) / -1 (low), alternating, capped to last 60.
export function detectPivots(klines, preset = "fast") {
  if (!klines || klines.length < 12) return [];
  const { left, right } = PIVOT_PRESETS[preset] || PIVOT_PRESETS.fast;
  const pivots = [];
  for (let i = left; i < klines.length - right; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (klines[j].high >= klines[i].high) isHigh = false;
      if (klines[j].low <= klines[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ price: klines[i].high, barIndex: i, dir: 1 });
    else if (isLow) pivots.push({ price: klines[i].low, barIndex: i, dir: -1 });
  }

  // Collapse consecutive same-direction pivots, keeping the most extreme.
  const zig = [];
  for (const p of pivots) {
    const last = zig[zig.length - 1];
    if (last && last.dir === p.dir) {
      if ((p.dir === 1 && p.price > last.price) || (p.dir === -1 && p.price < last.price)) {
        zig[zig.length - 1] = p;
      }
    } else {
      zig.push(p);
    }
  }
  return zig.slice(-60);
}

function buildPattern(id, pivs, bear) {
  const [pX, pA, pB, pC, pD] = pivs;
  const [bX, bA, bB, bC, bD] = pivs.map(p => p.barIndex);
  const dir = bear ? -1 : 1;
  const absXA = Math.max(1e-10, Math.abs(pA.price - pX.price));
  const absAB = Math.max(1e-10, Math.abs(pB.price - pA.price));
  const absBC = Math.max(1e-10, Math.abs(pC.price - pB.price));
  const rAB = Math.abs(pB.price - pA.price) / absXA;
  const rBC = Math.abs(pC.price - pB.price) / absAB;
  const rCD = Math.abs(pD.price - pC.price) / absBC;
  const rAD = Math.abs(pD.price - pA.price) / absXA;
  const rXC = Math.abs(pC.price - pX.price) / absXA;
  const rCDx = Math.abs(pD.price - pC.price) / Math.max(1e-10, Math.abs(pX.price - pC.price));

  const rg = PATTERN_RANGES[id];
  const vBC = id === 6 ? rXC : rBC;
  const vCD = id === 6 ? rCDx : rCD;
  const skipAD = id === 6 || id === 7 || id === 9;

  const fit = (
    scoreRatio(rAB, rg[0], rg[1]) +
    scoreRatio(vBC, rg[2], rg[3]) +
    scoreRatio(vCD, rg[4], rg[5]) +
    (skipAD ? 1.0 : scoreRatio(rAD, rg[6], rg[7]))
  ) / 4 * 100;

  // PRZ confluence projection at D.
  const mAD = (rg[6] + rg[7]) / 2;
  const mCD = (rg[4] + rg[5]) / 2;
  const sgn = bear ? 1 : -1; // bear: price falling further; bull: rising
  const dAD = id === 6 ? pC.price + sgn * 0.786 * Math.abs(pX.price - pC.price) : pA.price + sgn * mAD * absXA;
  const dCD = pC.price + sgn * mCD * absBC;
  const dAB = pC.price + sgn * absAB;

  let projC, sprP;
  if (id === 7) { projC = (dCD + dAB) / 2; sprP = Math.abs(dCD - dAB); }
  else if (id === 6 || id === 8) { projC = (dAD + dCD) / 2; sprP = Math.abs(dAD - dCD); }
  else if (id === 9) { projC = dCD; sprP = 0; }
  else { projC = (dAD + dCD + dAB) / 3; sprP = Math.max(Math.abs(dAD - dCD), Math.abs(dAD - dAB), Math.abs(dCD - dAB)); }

  const prz = Math.max(0, 100 - (Math.abs(pD.price - projC) / absXA) * 300 - (sprP / absXA) * 150);
  const conf = Math.round((fit + prz) / 2);

  // Trade levels.
  const risk = Math.max(1e-10, Math.abs(pD.price - pC.price));
  const extB = bear ? Math.max(pX.price, pB.price, pD.price) : Math.min(pX.price, pB.price, pD.price);
  const buf = Math.max(risk * 0.382, extB * 0.002);
  const sl = bear ? extB + buf : extB - buf;
  const entry = pD.price;
  const tp1 = entry + dir * risk;
  const tp2 = entry + dir * risk * 2;
  const tp3 = entry + dir * risk * 3;
  const rr = risk > 0 ? Math.abs(tp2 - entry) / risk : 2;

  return {
    id, name: PATTERN_NAMES[id], dir, bullish: dir === 1, bear,
    completed: true, status: "COMPLETED",
    pivots: { X: pX.price, A: pA.price, B: pB.price, C: pC.price, D: pD.price },
    bars: { bX, bA, bB, bC, bD },
    ratios: { rAB, rBC: id === 6 ? rXC : rBC, rCD: id === 6 ? rCDx : rCD, rAD, rXC },
    checks: {
      okAB: inRange(rAB, rg[0], rg[1]),
      okBC: inRange(id === 6 ? rXC : rBC, rg[2], rg[3]),
      okCD: inRange(id === 6 ? rCDx : rCD, rg[4], rg[5]),
      okAD: skipAD ? true : inRange(rAD, rg[6], rg[7]),
    },
    fit, prz, conf, grade: gradeOf(conf),
    przZone: { top: pD.price * 1.004, bottom: pD.price * 0.996 },
    entry, sl, tp1, tp2, tp3, rr,
  };
}

// Detect the best completed (5-pivot) pattern from the last 5 zigzag pivots.
function detectCompleted(zig) {
  if (zig.length < 5) return null;
  const n = zig.length;
  const pivs = [zig[n - 5], zig[n - 4], zig[n - 3], zig[n - 2], zig[n - 1]];
  const bear = pivs[0].dir === 1; // X is a high -> bearish harmonic
  let best = null;
  for (let id = 0; id < 10; id++) {
    let cand;
    try { cand = buildPattern(id, pivs, bear); } catch { continue; }
    const okAll = cand.checks.okAB && cand.checks.okBC && cand.checks.okCD && cand.checks.okAD;
    cand.okAll = okAll;
    if (!best || cand.conf > best.conf) best = cand;
  }
  return best;
}

// Detect potential (4-pivot) patterns: X,A,B,C with projected D zone.
function detectPotential(zig, maxResults = 3) {
  if (zig.length < 4) return [];
  const n = zig.length;
  const [pX, pA, pB, pC] = [zig[n - 4], zig[n - 3], zig[n - 2], zig[n - 1]];
  const [bX, bA, bB, bC] = [pX.barIndex, pA.barIndex, pB.barIndex, pC.barIndex];
  const bear = pX.dir === 1;
  const dir = bear ? -1 : 1;
  const sgn = bear ? 1 : -1;
  const absXA = Math.max(1e-10, Math.abs(pA.price - pX.price));
  const rAB = Math.abs(pB.price - pA.price) / absXA;
  const rBC = Math.abs(pC.price - pB.price) / Math.max(1e-10, Math.abs(pB.price - pA.price));
  const rXC = Math.abs(pC.price - pX.price) / absXA;

  const results = [];
  for (let id = 0; id < 10; id++) {
    const rg = PATTERN_RANGES[id];
    const vBC = id === 6 ? rXC : rBC;
    if (!inRange(rAB, rg[0], rg[1])) continue;
    if (!inRange(vBC, rg[2], rg[3])) continue;

    const mAD = (rg[6] + rg[7]) / 2;
    const mCD = (rg[4] + rg[5]) / 2;
    const dAD = id === 6 ? pC.price + sgn * 0.786 * Math.abs(pX.price - pC.price) : pA.price + sgn * mAD * absXA;
    const dCD = pC.price + sgn * mCD * Math.abs(pB.price - pC.price);
    const dAB = pC.price + sgn * Math.abs(pB.price - pA.price);

    let lo, hi;
    if (id === 6) { lo = dAD * 0.995; hi = dAD * 1.005; }
    else if (id === 7 || id === 9) { lo = Math.min(dCD, dAB); hi = Math.max(dCD, dAB); }
    else if (id === 8) { lo = Math.min(dAD, dCD); hi = Math.max(dAD, dCD); }
    else { lo = Math.min(dAD, dCD, dAB); hi = Math.max(dAD, dCD, dAB); }

    const spread = Math.max(hi - lo, absXA * 0.02);
    const zt = hi + spread * 0.15;
    const zb = lo - spread * 0.15;
    const D = (hi + lo) / 2;
    const fit = (scoreRatio(rAB, rg[0], rg[1]) + scoreRatio(vBC, rg[2], rg[3])) / 2 * 100;
    const prz = Math.max(0, 100 - (spread / absXA) * 100 * 3);
    const conf = Math.round((fit + prz) / 2);

    const entry = bear ? zb : zt;
    const sl = bear ? zt + spread * 0.25 : zb - spread * 0.25;
    const risk = Math.max(1e-10, Math.abs(entry - sl));
    const tp1 = entry + dir * risk;
    const tp2 = entry + dir * risk * 2;
    const tp3 = entry + dir * risk * 3;
    const okAll = true;

    results.push({
      id, name: PATTERN_NAMES[id], dir, bullish: dir === 1, bear,
      completed: false, status: "POTENTIAL",
      pivots: { X: pX.price, A: pA.price, B: pB.price, C: pC.price, D },
      bars: { bX, bA, bB, bC },
      ratios: { rAB, rBC: id === 6 ? rXC : rBC, rAD: 0, rXC },
      checks: { okAB: true, okBC: true, okCD: true, okAD: true, okAll },
      fit, prz, conf, grade: gradeOf(conf),
      przZone: { top: zt, bottom: zb },
      entry, sl, tp1, tp2, tp3, rr: risk > 0 ? Math.abs(tp2 - entry) / risk : 2,
    });
    if (results.length >= maxResults) break;
  }
  return results.sort((a, b) => b.conf - a.conf);
}

// Full analysis for one pair's klines.
export function analyzeHarmonics(klines, preset = "fast") {
  if (!klines || klines.length < 20) return { patterns: [], best: null, pivotCount: 0 };
  const zig = detectPivots(klines, preset);
  const potentials = detectPotential(zig, 3);
  const completed = detectCompleted(zig);
  const patterns = [completed, ...potentials].filter(Boolean).sort((a, b) => {
    const rank = p => (p.completed ? 1000 : 0) + p.conf;
    return rank(b) - rank(a);
  });
  return { patterns, best: patterns[0] || null, pivotCount: zig.length };
}