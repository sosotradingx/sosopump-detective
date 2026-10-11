import React, { useState, useEffect } from "react";

// Radar: scatter plot care corelează viteza mișcării de preț (σ, axa X) cu
// explozia de volum (× normal, axa Y, scară log). Legat direct de metricele
// existente: micro.retZ (z-score return), base.volumeSpikeVal (volum/SMA20),
// base.pumpPercent (direcție), quoteVolume (mărime punct), status.
// Zonele de aprindere/prăbușire folosesc aceleași praguri ca trigger-ul de 5m:
// |retZ| >= 2 σ cu volum >= 3× normal.

const X_MIN = -8, X_MAX = 8;
const Y_MIN = 0.3, Y_MAX = 30;
const PAD_L = 50, PAD_R = 14, PAD_T = 14, PAD_B = 38;
const VW = 640, VH = 440;
const PLOT_W = VW - PAD_L - PAD_R;
const PLOT_H = VH - PAD_T - PAD_B;

const X_TICKS = [-8, -5, -3.5, -2, 0, 2, 3.5, 5, 8];
const Y_TICKS = [0.5, 1, 3, 10, 30];

const ln = Math.log;
const clampX = (x) => Math.max(X_MIN, Math.min(X_MAX, x));
const clampY = (y) => Math.max(Y_MIN, Math.min(Y_MAX, y));
const xToPx = (x) => PAD_L + ((clampX(x) - X_MIN) / (X_MAX - X_MIN)) * PLOT_W;
const yToPx = (y) => {
  const yy = clampY(y);
  const t = (ln(Y_MAX) - ln(yy)) / (ln(Y_MAX) - ln(Y_MIN));
  return PAD_T + t * PLOT_H;
};

const dotRadius = (vol) => {
  const v = Math.max(0, Number(vol) || 0);
  return Math.max(3, Math.min(14, 3 + Math.sqrt(v / 1e6) * 0.45));
};

const C = {
  bg: "#0b1622",
  grid: "#1e3040",
  axis: "#33445a",
  text: "#9fb0c0",
  up: "#00c2a8",
  down: "#e64a4a",
  ring: "#ffcc00",
};

export default function RadarPanel({ pairs, onSelectSymbol }) {
  const [showTrails, setShowTrails] = useState(true);
  const [trails, setTrails] = useState({});

  const points = (pairs || [])
    .filter(p => p.base && p.micro)
    .map(p => {
      const retZ = Number(p.micro.retZ) || 0;
      const volMult = Number(p.base.volumeSpikeVal) || 1;
      const up = (Number(p.base.pumpPercent ?? p.priceChangePercent) ?? 0) >= 0;
      return {
        symbol: p.symbol, x: retZ, y: volMult, vol: p.quoteVolume || 0,
        up, candidate: Math.abs(retZ) >= 2 && volMult >= 3,
      };
    });

  // Urmărește fiecare monedă de la prima apariție: adaugă un punct pe scanare,
  // păstrează ultimele 10 (≈ 20 min la cadența de 2 min a dashboardului).
  useEffect(() => {
    const now = Date.now();
    setTrails(prev => {
      const next = { ...prev };
      points.forEach(pt => {
        const arr = (next[pt.symbol] || []).slice();
        if (!arr.length || now - arr[arr.length - 1].t > 60000) {
          arr.push({ x: pt.x, y: pt.y, up: pt.up, t: now });
          if (arr.length > 10) arr.shift();
        }
        next[pt.symbol] = arr;
      });
      Object.keys(next).forEach(sym => {
        const arr = next[sym];
        if (arr.length && now - arr[arr.length - 1].t > 30 * 60000) delete next[sym];
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs]);

  const ignition = points.filter(p => p.x >= 2 && p.y >= 3).length;
  const crash = points.filter(p => p.x <= -2 && p.y >= 3).length;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">📡 Radar</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Cât de repede se mișcă prețul (σ) față de cât de mult a crescut volumul. Candidații apar în colțurile de sus.
            {ignition + crash > 0 && (
              <span className="text-foreground/80"> · {ignition} aprindere / {crash} prăbușire acum.</span>
            )}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none shrink-0">
          <input type="checkbox" checked={showTrails} onChange={e => setShowTrails(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
          Urme (ultimele scanări)
        </label>
      </div>

      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full mt-2" style={{ height: "auto" }} preserveAspectRatio="xMidYMid meet">
        <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill={C.bg} rx="6" />

        {/* Zonele de aprindere (teal, dreapta-sus) și prăbușire (roșu, stânga-sus) */}
        <rect x={xToPx(2)} y={yToPx(Y_MAX)} width={xToPx(X_MAX) - xToPx(2)} height={yToPx(3) - yToPx(Y_MAX)}
          fill="none" stroke={C.up} strokeDasharray="5 4" strokeOpacity="0.6" rx="4" />
        <rect x={xToPx(X_MIN)} y={yToPx(Y_MAX)} width={xToPx(-2) - xToPx(X_MIN)} height={yToPx(3) - yToPx(Y_MAX)}
          fill="none" stroke={C.down} strokeDasharray="5 4" strokeOpacity="0.6" rx="4" />

        {/* Grilă + marcaje */}
        {X_TICKS.map(t => (
          <g key={`x${t}`}>
            <line x1={xToPx(t)} y1={PAD_T} x2={xToPx(t)} y2={PAD_T + PLOT_H}
              stroke={t === 0 ? C.axis : C.grid} strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={xToPx(t)} y={PAD_T + PLOT_H + 13} fill={C.text} fontSize="9.5" textAnchor="middle" fontFamily="monospace">
              {t > 0 ? `+${t}` : t}
            </text>
          </g>
        ))}
        {Y_TICKS.map(t => (
          <g key={`y${t}`}>
            <line x1={PAD_L} y1={yToPx(t)} x2={PAD_L + PLOT_W} y2={yToPx(t)}
              stroke={t === 1 ? C.axis : C.grid} strokeWidth={t === 1 ? 1 : 0.5} />
            <text x={PAD_L - 5} y={yToPx(t) + 3} fill={C.text} fontSize="9.5" textAnchor="end" fontFamily="monospace">×{t}</text>
          </g>
        ))}

        {/* Etichete axe */}
        <text x={PAD_L + PLOT_W / 2} y={VH - 5} fill={C.text} fontSize="10.5" textAnchor="middle">
          vânzare ← viteza prețului (σ) → cumpărare
        </text>
        <text x={12} y={PAD_T + PLOT_H / 2} fill={C.text} fontSize="10.5" textAnchor="middle"
          transform={`rotate(-90 12 ${PAD_T + PLOT_H / 2})`}>volum față de normal</text>

        {/* Urmele (trails) — ultima poziție dă culoarea */}
        {showTrails && Object.entries(trails).map(([sym, arr]) => {
          if (!arr || arr.length < 2) return null;
          const d = arr.map(p => `${xToPx(p.x)},${yToPx(p.y)}`).join(" ");
          const last = arr[arr.length - 1];
          return (
            <polyline key={`tr-${sym}`} points={d} fill="none"
              stroke={last.up ? C.up : C.down} strokeWidth="1" strokeOpacity="0.35" strokeLinejoin="round" />
          );
        })}

        {/* Punctele (monedele) */}
        {points.map(pt => {
          const cx = xToPx(pt.x), cy = yToPx(pt.y), r = dotRadius(pt.vol);
          const color = pt.up ? C.up : C.down;
          return (
            <g key={pt.symbol} className="cursor-pointer" onClick={() => onSelectSymbol?.(pt.symbol)}>
              {pt.candidate && (
                <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke={C.ring} strokeWidth="1.5" strokeOpacity="0.9" />
              )}
              <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity="0.85" stroke={color} strokeWidth="0.5" />
              <text x={cx + r + 2} y={cy + 3} fill="#e0e0e0" fontSize="8.5" fontFamily="monospace">
                {pt.symbol.replace(/USDT$/, "")}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legenda */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.up }} /> urcă</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.down }} /> scade</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2" style={{ borderColor: C.ring }} /> candidat aprindere/prăbușire</span>
        <span>mărimea = volum 24h</span>
      </div>
    </div>
  );
}