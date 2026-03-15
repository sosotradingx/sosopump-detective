import React, { useMemo } from "react";

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const ax = a.slice(-n), bx = b.slice(-n);
  const ma = ax.reduce((s, v) => s + v, 0) / n;
  const mb = bx.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ax[i] - ma) * (bx[i] - mb);
    da += (ax[i] - ma) ** 2;
    db += (bx[i] - mb) ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

function corrColor(r) {
  if (r === null) return "text-muted-foreground";
  if (r > 0.7) return "text-chart-green";
  if (r > 0.3) return "text-pump-active";
  if (r < -0.7) return "text-chart-red";
  if (r < -0.3) return "text-pump-weak";
  return "text-muted-foreground";
}

export default function CorrelationBar({ klinesMap, symbols }) {
  const pairs = useMemo(() => {
    const result = [];
    const syms = symbols.filter(s => s && klinesMap[s]?.length > 5);
    for (let i = 0; i < syms.length; i++) {
      for (let j = i + 1; j < syms.length; j++) {
        const a = klinesMap[syms[i]]?.map(k => k.close) ?? [];
        const b = klinesMap[syms[j]]?.map(k => k.close) ?? [];
        const r = pearson(a, b);
        result.push({ a: syms[i], b: syms[j], r });
      }
    }
    return result;
  }, [klinesMap, symbols]);

  if (pairs.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider shrink-0">Corelații:</span>
      {pairs.map(({ a, b, r }) => (
        <div key={a + b} className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">
            {a.replace("USDT", "")} / {b.replace("USDT", "")}
          </span>
          <span className={`text-[11px] font-mono font-bold ${corrColor(r)}`}>
            {r !== null ? (r > 0 ? "+" : "") + r.toFixed(2) : "—"}
          </span>
          <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${r !== null && r > 0 ? "bg-chart-green" : "bg-chart-red"}`}
              style={{ width: `${Math.abs(r ?? 0) * 100}%`, marginLeft: r !== null && r < 0 ? "auto" : 0 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}