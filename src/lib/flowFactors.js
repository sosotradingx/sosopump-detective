// Factori de decizie din flow & lichiditate. Funcții pure peste datele deja calculate de
// scanner (deriv, micro, order book brut) plus fluxul de lichidări live.
// Fiecare factor întoarce: { key, label, level: PASS|WARN|BLOCK, detail }

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const usd = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${Math.round(n)}`);

export const LEVEL = { pass: "PASS", warn: "WARN", block: "BLOCK" };

export const LEVEL_META = {
  PASS: { label: "Confirmă", cls: "bg-pump-strong/10 text-pump-strong border-pump-strong/30" },
  WARN: { label: "Atenție", cls: "bg-pump-active/10 text-pump-active border-pump-active/30" },
  BLOCK: { label: "Blochează", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

// --- 1) OI × preț: cine construiește mișcarea ---
export function oiPriceFactor({ oiChangePct, pumpPercent } = {}) {
  const oi = num(oiChangePct);
  const px = num(pumpPercent);
  if (oi == null || px == null) {
    return { key: "oi_price", label: "OI × preț", level: LEVEL.warn, detail: "date indisponibile" };
  }
  if (oi >= 2 && px > 0) {
    return { key: "oi_price", label: "OI × preț", level: LEVEL.pass, detail: `OI +${oi.toFixed(1)}% cu preț +${px.toFixed(1)}% → levier nou, continuare` };
  }
  if (oi >= 3 && Math.abs(px) <= 1.5) {
    return { key: "oi_price", label: "OI × preț", level: LEVEL.warn, detail: `OI +${oi.toFixed(1)}% cu preț plat → poziții noi fără direcție (posibilă capcană)` };
  }
  if (oi <= -2 && px > 0) {
    return { key: "oi_price", label: "OI × preț", level: LEVEL.warn, detail: `OI ${oi.toFixed(1)}% cu preț +${px.toFixed(1)}% → doar short-covering, combustibil slab` };
  }
  if (oi <= -2 && px < 0) {
    return { key: "oi_price", label: "OI × preț", level: LEVEL.block, detail: `OI ${oi.toFixed(1)}% cu preț ${px.toFixed(1)}% → longi închid, trend în descompunere` };
  }
  return { key: "oi_price", label: "OI × preț", level: LEVEL.pass, detail: `OI ${oi >= 0 ? "+" : ""}${oi.toFixed(1)}% · preț ${px >= 0 ? "+" : ""}${px.toFixed(1)}% → fără conflict` };
}

// --- 2) Funding + crowding retail: combustibilul rămas ---
export function fundingFactor({ fundingRate, longShortRatio } = {}) {
  const f = num(fundingRate);
  const ls = num(longShortRatio);
  const parts = [];
  if (f != null) parts.push(`funding ${f.toFixed(3)}%/8h`);
  if (ls != null) parts.push(`long/short ${ls.toFixed(2)}`);
  if (f == null && ls == null) {
    return { key: "funding", label: "Funding & crowding", level: LEVEL.warn, detail: "date indisponibile" };
  }
  if (f != null && f <= -0.01) {
    return { key: "funding", label: "Funding & crowding", level: LEVEL.pass, detail: `${parts.join(" · ")} → shortii plătesc, combustibil pentru squeeze` };
  }
  if (f != null && f >= 0.1) {
    return { key: "funding", label: "Funding & crowding", level: LEVEL.block, detail: `${parts.join(" · ")} → longi suprataxați, combustibil consumat` };
  }
  if (f != null && f >= 0.05) {
    return { key: "funding", label: "Funding & crowding", level: LEVEL.warn, detail: `${parts.join(" · ")} → funding ridicat, risc de long squeeze` };
  }
  if (ls != null && ls >= 2.5) {
    return { key: "funding", label: "Funding & crowding", level: LEVEL.warn, detail: `${parts.join(" · ")} → retail mult prea long (semnal contrarian)` };
  }
  if (ls != null && ls <= 0.7) {
    return { key: "funding", label: "Funding & crowding", level: LEVEL.pass, detail: `${parts.join(" · ")} → retail short, squeeze posibil` };
  }
  return { key: "funding", label: "Funding & crowding", level: LEVEL.pass, detail: `${parts.join(" · ")} → echilibrat` };
}

// --- 3) Lichidări: benzi tipice (1/levier) + cascadă reală pe simbol ---
export function liquidationFactor({ price, oi, liq } = {}) {
  const p = num(price);
  if (!p) return { key: "liq", label: "Lichidări", level: LEVEL.warn, detail: "date indisponibile" };

  const oiUsd = num(oi) ? p * num(oi) : null;
  const band25 = 100 / 25;
  const short5 = num(liq?.short5) || 0;
  const long5 = num(liq?.long5) || 0;
  const total5 = short5 + long5;
  const flow = total5 > 0 ? ` · lichidări 5m ${usd(total5)}` : "";

  if (total5 >= 500000 && short5 > long5 * 2) {
    return { key: "liq", label: "Lichidări", level: LEVEL.pass, detail: `Cascadă short ${usd(short5)} în 5m → combustibil pentru continuare` };
  }
  if (total5 >= 500000 && long5 > short5 * 2) {
    return { key: "liq", label: "Lichidări", level: LEVEL.block, detail: `Cascadă long ${usd(long5)} în 5m → risc de prăbușire` };
  }
  return {
    key: "liq", label: "Lichidări", level: LEVEL.pass,
    detail: `Benzi la 25x ±${band25.toFixed(1)}%${oiUsd ? ` · OI ${usd(oiUsd)}` : ""}${flow}`,
  };
}

// --- 4) Cost real de execuție: spread + adâncime în ±0.5% ---
export function executionFactor({ orderBook, price, tradeSize = 200 } = {}) {
  const p = num(price);
  const bestBid = num(orderBook?.bids?.[0]?.[0]);
  const bestAsk = num(orderBook?.asks?.[0]?.[0]);
  if (!p || !bestBid || !bestAsk) {
    return { key: "exec", label: "Cost execuție", level: LEVEL.warn, detail: "order book indisponibil" };
  }

  const spreadPct = ((bestAsk - bestBid) / p) * 100;
  const depth = (rows, lo, hi) => (rows || []).reduce((s, r) => {
    const pp = num(r?.[0]);
    const q = num(r?.[1]);
    return pp != null && q != null && pp >= lo && pp <= hi ? s + pp * q : s;
  }, 0);
  const half = p * 0.005;
  const depthTotal = depth(orderBook.asks, p, p + half) + depth(orderBook.bids, p - half, p);
  const impactPct = depthTotal > 0 ? 0.5 * (tradeSize / depthTotal) : 1; // impact liniar estimat
  const slipPct = spreadPct / 2 + impactPct;
  const level = slipPct <= 0.1 ? LEVEL.pass : slipPct <= 0.3 ? LEVEL.warn : LEVEL.block;

  return {
    key: "exec", label: "Cost execuție", level,
    detail: `Spread ${spreadPct.toFixed(3)}% · adâncime ±0.5% ${depthTotal > 0 ? usd(depthTotal) : "—"} · slippage est. ${slipPct.toFixed(2)}% la $${tradeSize}`,
  };
}

// --- Sumar: câți factori confirmă și dacă vreunul blochează intrarea ---
export function flowSummary(factors = []) {
  const pass = factors.filter(f => f.level === LEVEL.pass).length;
  const warn = factors.filter(f => f.level === LEVEL.warn).length;
  const block = factors.filter(f => f.level === LEVEL.block).length;
  return { pass, warn, block, blocked: block > 0, verdict: block > 0 ? "blocked" : warn > 0 ? "warn" : "ok" };
}