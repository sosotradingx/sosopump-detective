import React, { useState, useEffect } from "react";
import { fetchCrossExchange } from "@/lib/crossExchange";
import { formatVolume } from "@/components/scanner/binanceApi";
import { Loader2, ArrowLeftRight } from "lucide-react";

const fmtPct = (v, digits = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`);

function Metric({ label, primary, secondary }) {
  return (
    <div className="flex items-center justify-between text-[11px] font-mono py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-foreground">{primary}</span>
        {secondary != null && <span className="text-muted-foreground">{secondary}</span>}
      </span>
    </div>
  );
}

function Column({ side }) {
  if (!side) {
    return (
      <div className="bg-secondary/30 rounded-lg p-3 text-[11px] text-muted-foreground text-center">
        Perechea nu este listată aici
      </div>
    );
  }
  return (
    <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
      <p className="text-[10px] font-mono text-muted-foreground mb-1">{side.name.toUpperCase()}</p>
      <Metric label="Preț" primary={side.price != null ? side.price.toString() : "—"} />
      <Metric label="24h" primary={fmtPct(side.change24h)} />
      <Metric label="Funding" primary={side.funding != null ? `${side.funding.toFixed(4)}%` : "—"} />
      <Metric label="OI" primary={side.oi != null ? formatVolume(side.oi) : "—"} secondary={fmtPct(side.oiChangePct, 1)} />
      <Metric label="Vol 24h" primary={side.volume24h != null ? `$${formatVolume(side.volume24h)}` : "—"} />
    </div>
  );
}

// Binance vs Bybit for the same symbol: which venue leads, and whether the
// positioning diverges enough to be worth a spread / funding play.
export default function CrossExchangePanel({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = () => fetchCrossExchange(symbol).then(d => { if (alive) { setData(d); setLoading(false); } });
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [symbol]);

  const spread = data?.spreadBps;
  const spreadBig = spread != null && Math.abs(spread) >= 5;
  const leader = data?.binance && data?.bybit
    ? ((data.binance.oiChangePct ?? 0) > (data.bybit.oiChangePct ?? 0) ? data.binance : data.bybit)
    : null;
  const fundingPlay = data?.fundingDiff != null && Math.abs(data.fundingDiff) >= 0.02 && spreadBig;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5" /> BINANCE vs BYBIT
        </h3>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      {!data && !loading ? (
        <p className="text-[11px] text-muted-foreground text-center py-3">
          Perechea nu a putut fi citită de pe cele două burse.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Column side={data?.binance} />
            <Column side={data?.bybit} />
          </div>

          <div className="space-y-1 text-[11px] font-mono">
            <Metric
              label="Spread preț"
              primary={spread != null ? `${spread >= 0 ? "+" : ""}${spread.toFixed(1)} bps` : "—"}
              secondary={spread != null ? `Binance ${spread >= 0 ? "peste" : "sub"} Bybit` : null}
            />
            <Metric
              label="Diferență funding"
              primary={data?.fundingDiff != null ? `${data.fundingDiff >= 0 ? "+" : ""}${data.fundingDiff.toFixed(4)} pp` : "—"}
            />
            <Metric
              label="Diferență ΔOI 1h"
              primary={data?.oiDiff != null ? `${data.oiDiff >= 0 ? "+" : ""}${data.oiDiff.toFixed(1)} pp` : "—"}
            />
            <Metric
              label="Volum B/Y"
              primary={data?.volumeRatio != null ? `${data.volumeRatio.toFixed(2)}×` : "—"}
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {leader && (leader.oiChangePct ?? 0) > 1 && (
              <span className="text-[10px] bg-chart-blue/15 text-chart-blue px-2 py-0.5 rounded">
                {leader.name} conduce (OI {fmtPct(leader.oiChangePct, 1)})
              </span>
            )}
            {spreadBig && (
              <span className="text-[10px] bg-pump-active/15 text-pump-active px-2 py-0.5 rounded">
                Spread {Math.abs(spread).toFixed(0)} bps — {spread > 0 ? "ieftin pe Bybit" : "ieftin pe Binance"}
              </span>
            )}
            {fundingPlay && (
              <span className="text-[10px] bg-chart-purple/20 text-chart-purple px-2 py-0.5 rounded">
                Divergență funding {data.fundingDiff >= 0 ? "Binance > Bybit" : "Bybit > Binance"}
              </span>
            )}
            {!leader && !spreadBig && (
              <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded">
                Bursele sunt aliniate
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}