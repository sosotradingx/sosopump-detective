import React from "react";
import { Flame, TrendingDown, TrendingUp } from "lucide-react";
import { formatUsd } from "@/lib/liquidations";

// Live liquidation clusters. Red = longs liquidated (downward cascade),
// green = shorts squeezed (upward cascade — the ignition we want to catch early).
export default function LiquidationPanel({ liq, exchange }) {
  const total5 = liq?.total5 || 0;
  const long5 = liq?.long5 || 0;
  const short5 = liq?.short5 || 0;
  const longPct = total5 > 0 ? (long5 / total5) * 100 : 0;
  const rows = liq?.top || [];

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-pump-active" /> Lichidări live
        </h3>
        <span className={`flex items-center gap-1 text-[10px] font-mono ${liq?.connected ? "text-pump-strong" : "text-muted-foreground"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${liq?.connected ? "bg-pump-strong animate-pulse" : "bg-muted-foreground"}`} />
          {liq?.connected ? "LIVE" : "conectare..."}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-secondary/40 rounded-lg p-2">
          <p className="text-[9px] font-mono text-muted-foreground flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-chart-red" /> LONG lichidat 5m
          </p>
          <p className="text-chart-red font-bold font-mono text-sm mt-0.5">${formatUsd(long5)}</p>
        </div>
        <div className="bg-secondary/40 rounded-lg p-2">
          <p className="text-[9px] font-mono text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-chart-green" /> SHORT lichidat 5m
          </p>
          <p className="text-chart-green font-bold font-mono text-sm mt-0.5">${formatUsd(short5)}</p>
        </div>
      </div>

      {total5 > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-secondary">
          <div className="bg-chart-red" style={{ width: `${longPct}%` }} />
          <div className="bg-chart-green" style={{ width: `${100 - longPct}%` }} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-3">
          {liq?.connected ? "Nicio lichidare în ultimele 15 min — piață calmă." : "Se conectează la fluxul de lichidări..."}
        </p>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 6).map(r => (
            <div key={r.symbol} className="flex items-center justify-between gap-2 text-[10px] font-mono">
              <span className="font-semibold w-16 truncate">{r.symbol.replace("USDT", "")}</span>
              <span className="text-chart-red">${formatUsd(r.long5)}</span>
              <span className="text-chart-green">${formatUsd(r.short5)}</span>
              {r.lead ? (
                <span className={`px-1.5 py-0.5 rounded ${r.lead === "short" ? "bg-chart-green/20 text-chart-green" : "bg-destructive/20 text-destructive"}`}>
                  {r.lead === "short" ? "squeeze" : "cascadă"}
                </span>
              ) : <span className="w-10" />}
            </div>
          ))}
        </div>
      )}

      <p className="text-[9px] text-muted-foreground">
        {exchange === "bybit" ? "Bybit: perechile scanate" : "Binance: toată piața futures"} · fereastră 5m (total 15m: ${formatUsd((liq?.long15 || 0) + (liq?.short15 || 0))})
      </p>
    </div>
  );
}