import React from "react";
import MarketRegimeBadge from "@/components/dashboard/MarketRegimeBadge";

const fmtPct = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const pctClass = (v) => (v == null || v === 0 ? "text-muted-foreground" : v > 0 ? "text-pump-strong" : "text-destructive");

function Row({ label, value, valueClass = "text-foreground" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

// Context de piață derivat din scanarea curentă: BTC, lățimea pieței, regimul dominant
// și perechile care urcă în topul volumului (semnal timpuriu de interes).
export default function MarketContextCard({ btcCtx, breadthPct, pairs = [], climbers = [], onSelectSymbol }) {
  const counts = { TRENDING: 0, RANGING: 0, MIXED: 0 };
  pairs.forEach(p => { const r = p.base?.marketRegime; if (counts[r] != null) counts[r] += 1; });
  const total = counts.TRENDING + counts.RANGING + counts.MIXED;
  const regime = total ? Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a)) : null;
  const empty = !btcCtx?.ok && !total;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">🌍 Context de Piață</h3>
        {regime && <MarketRegimeBadge regime={regime} />}
      </div>

      {empty ? (
        <p className="text-xs text-muted-foreground">Aștept datele scanării...</p>
      ) : (
        <>
          <div className="space-y-2 text-xs">
            <Row label="BTC 1h" value={fmtPct(btcCtx?.change1h)} valueClass={pctClass(btcCtx?.change1h)} />
            <Row label="BTC 24h" value={fmtPct(btcCtx?.change24h)} valueClass={pctClass(btcCtx?.change24h)} />
            <Row
              label="Perechi pe plus"
              value={breadthPct == null ? "—" : `${Math.round(breadthPct)}%`}
              valueClass={breadthPct >= 50 ? "text-pump-strong" : "text-destructive"} />
            {total > 0 &&
              <Row label="Regim scanat" value={`${counts.TRENDING} T · ${counts.RANGING} R · ${counts.MIXED} M`} />
            }
          </div>

          {climbers.length > 0 && (
            <div className="pt-3 border-t border-border space-y-1">
              <p className="text-[10px] font-mono text-muted-foreground">
                URCĂRI ÎN TOP VOLUME ({climbers.length})
              </p>
              {climbers.slice(0, 5).map(c => (
                <button
                  key={c.symbol}
                  onClick={() => onSelectSymbol?.(c.symbol)}
                  className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-accent transition-colors">
                  <span className="text-xs font-mono">{c.symbol.replace("USDT", "")}</span>
                  <span className={`text-xs font-mono ${pctClass(c.priceChangePercent)}`}>
                    {fmtPct(c.priceChangePercent)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}