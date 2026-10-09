// Factori de risc & protecție: sizing pe volatilitate, expunere/concentrare și kill-switch.
// Toate funcțiile sunt pure; pragurile se aplică atât în UI (Dashboard), cât și în bot.

export const RISK_LIMITS = {
  initialBalance: 10000,
  dailyLossPct: 3,          // oprește intrările noi după -3% într-o zi
  maxConsecutiveLosses: 4,  // pauză după 4 pierderi la rând
  maxDrawdownPct: 15,       // oprește intrările la 15% sub vârful de echitate
  riskPerTradePct: 1,       // risc maxim pe tranzacție (bază pentru sizing-ul pe ATR)
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// --- Datele necesare: o singură agregare (serie zilnică) + ultimele închideri ---
export async function loadRiskInputs(base44, userEmail) {
  const [dailyAgg, recentClosed] = await Promise.all([
    base44.entities.PaperTrade.aggregate({
      query: { created_by: userEmail, status: "closed" },
      dateBucket: { field: "updated_date", unit: "day" },
      sum: ["pnl_usd"],
    }).catch(() => null),
    base44.entities.PaperTrade.filter(
      { created_by: userEmail, status: "closed" }, "-updated_date", 20,
    ).catch(() => []),
  ]);
  return {
    dailyRows: (dailyAgg && dailyAgg.rows) || [],
    recentClosed: Array.isArray(recentClosed) ? recentClosed : [],
  };
}

// Cheia de zi din rândurile de agregare (numele câmpului poate veni cu/fără sufix)
export function rowDay(row) {
  const raw = row?.updated_date ?? row?.date ?? row?.day ?? row?.bucket ?? "";
  return String(raw).slice(0, 10);
}

// --- Kill-switch: pierdere zilnică, pierderi consecutive, drawdown din vârf ---
export function computeRiskState({ dailyRows = [], recentClosed = [], limits = RISK_LIMITS } = {}) {
  const days = dailyRows
    .map(r => ({ day: rowDay(r), pnl: num(r?.sum_pnl_usd) }))
    .filter(r => r.day)
    .sort((a, b) => a.day.localeCompare(b.day));

  const totalPnl = days.reduce((s, r) => s + r.pnl, 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayPnl = days.filter(d => d.day === todayKey).reduce((s, d) => s + d.pnl, 0);

  let eq = limits.initialBalance;
  let peak = limits.initialBalance;
  days.forEach(d => {
    eq += d.pnl;
    if (eq > peak) peak = eq;
  });
  const equity = limits.initialBalance + totalPnl;
  const drawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

  let streak = 0;
  for (const t of recentClosed) {
    if (num(t?.pnl_usd) < 0) streak++;
    else break;
  }

  const dailyLossUsd = (limits.initialBalance * limits.dailyLossPct) / 100;
  const flags = {
    daily: todayPnl <= -dailyLossUsd,
    streak: streak >= limits.maxConsecutiveLosses,
    drawdown: drawdownPct >= limits.maxDrawdownPct,
  };
  const reasons = [];
  if (flags.daily) reasons.push(`Pierdere azi $${Math.abs(todayPnl).toFixed(0)} (limita $${dailyLossUsd.toFixed(0)})`);
  if (flags.streak) reasons.push(`${streak} pierderi consecutive (max ${limits.maxConsecutiveLosses})`);
  if (flags.drawdown) reasons.push(`Drawdown ${drawdownPct.toFixed(1)}% (max ${limits.maxDrawdownPct}%)`);

  return {
    equity, totalPnl, todayPnl, peak, drawdownPct, streak, flags,
    blocked: flags.daily || flags.streak || flags.drawdown,
    reasons, dailyLossUsd, days,
  };
}

// --- Sizing pe volatilitate: risc fix pe tranzacție, stop proporțional cu ATR ---
export function atrSizing({ atrPct, balance, riskPerTradePct = RISK_LIMITS.riskPerTradePct, maxPct = 40 } = {}) {
  const atr = Number(atrPct);
  const bal = Number(balance);
  if (!Number.isFinite(atr) || atr <= 0 || !Number.isFinite(bal) || bal <= 0) return null;
  const stopPct = Math.max(atr * 1.5, 1.5);          // stop = 1.5 × ATR (minim 1.5%)
  const riskUsd = (bal * riskPerTradePct) / 100;
  const raw = (riskUsd / stopPct) * 100;             // notional = risc / distanța stopului
  const cap = (bal * maxPct) / 100;
  return { stopPct, riskUsd, notional: Math.min(raw, cap), capped: raw > cap };
}

// --- Expunere & concentrare pe pozițiile deschise ---
export function exposureState(openTrades = [], equity = RISK_LIMITS.initialBalance) {
  const locked = openTrades.reduce((s, t) => s + num(t.entry_price) * num(t.quantity), 0);
  const longs = openTrades.filter(t => (t.side || "BUY") === "BUY").length;
  const bySymbol = {};
  openTrades.forEach(t => {
    bySymbol[t.symbol] = (bySymbol[t.symbol] || 0) + num(t.entry_price) * num(t.quantity);
  });
  const top = Object.entries(bySymbol).sort((a, b) => b[1] - a[1])[0] || null;
  return {
    count: openTrades.length,
    locked,
    lockedPct: equity > 0 ? (locked / equity) * 100 : 0,
    longs,
    shorts: openTrades.length - longs,
    topSymbol: top ? top[0] : null,
    topUsd: top ? top[1] : 0,
    topPct: top && locked > 0 ? (top[1] / locked) * 100 : 0,
    oneDirection: openTrades.length > 1 && longs === openTrades.length,
  };
}