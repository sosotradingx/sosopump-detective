import React from "react";
import { formatPrice, formatVolume } from "../scanner/binanceApi";
import { EXCHANGES } from "@/lib/exchanges";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Loader2, Flame } from "lucide-react";

const statusColors = {
  STRONG: "bg-pump-strong/20 text-pump-strong border-pump-strong/30",
  ACTIVE: "bg-pump-active/20 text-pump-active border-pump-active/30",
  WEAK: "bg-pump-weak/20 text-pump-weak border-pump-weak/30",
  EARLY: "bg-pump-early/20 text-pump-early border-pump-early/30",
  WATCH: "bg-chart-blue/20 text-chart-blue border-chart-blue/30",
  DUMP_RISK: "bg-destructive/20 text-destructive border-destructive/30",
  INVALIDATED: "bg-secondary text-muted-foreground border-border",
  CLOSED: "bg-secondary text-muted-foreground border-border",
  INACTIVE: "bg-pump-inactive/20 text-pump-inactive border-pump-inactive/30",
};

function ExchangeSelector({ exchange, onExchangeChange }) {
  return (
    <div className="flex items-center gap-1 bg-secondary/60 rounded-lg p-1">
      {EXCHANGES.map((ex) => (
        <button
          key={ex.id}
          onClick={() => onExchangeChange?.(ex.id)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            exchange === ex.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {ex.name}
        </button>
      ))}
    </div>
  );
}

export default function TopPumpsTable({ data, exchange = "binance", onExchangeChange, loading, onSelectPair, liq }) {
  const empty = !data || data.length === 0;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">🔥 Top Pump Signals</h3>
        <ExchangeSelector exchange={exchange} onExchangeChange={onExchangeChange} />
      </div>

      {empty ? (
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          <span>{loading ? "Se încarcă datele..." : "Niciun semnal — încearcă alt exchange sau Refresh."}</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left p-3 font-medium">Pereche</th>
                <th className="text-right p-3 font-medium">Preț</th>
                <th className="text-right p-3 font-medium">24h %</th>
                <th className="text-right p-3 font-medium">Strength</th>
                <th className="text-right p-3 font-medium">Manip %</th>
                <th className="text-right p-3 font-medium">Liq 5m</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Volum</th>
              </tr>
            </thead>
            <tbody>
              {[...data]
                .sort((a, b) => (b.strength ?? b.analysis?.totalScore ?? 0) - (a.strength ?? a.analysis?.totalScore ?? 0))
                .slice(0, 12)
                .map((item) => {
                  const positive = item.priceChangePercent >= 0;
                  return (
                    <tr
                      key={item.symbol}
                      className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => onSelectPair?.(item.symbol)}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{item.emoji || item.analysis?.pumpEmoji || "⚫"}</span>
                          <div>
                            <p className="font-semibold font-mono flex items-center gap-1">
                              {item.symbol.replace("USDT", "")}
                              {item.isClimber && <span className="text-[9px] text-chart-gold font-normal">↑rank</span>}
                            </p>
                            <p className="text-[10px] text-muted-foreground">/ USDT · {item.base?.marketRegime || item.analysis?.marketRegime || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono">{formatPrice(item.price)}</td>
                      <td className={`p-3 text-right font-mono font-medium ${positive ? "text-chart-green" : "text-chart-red"}`}>
                        <span className="flex items-center justify-end gap-1">
                          {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {positive ? "+" : ""}{item.priceChangePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono font-bold text-lg ${
                          (item.strength ?? 0) >= 70 ? "text-pump-strong" :
                          (item.strength ?? 0) >= 45 ? "text-pump-active" :
                          (item.strength ?? 0) >= 20 ? "text-pump-weak" : "text-muted-foreground"
                        }`}>
                          {item.strength ?? 0}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-mono text-xs ${
                        (item.manipulation ?? 0) >= 60 ? "text-destructive" :
                        (item.manipulation ?? 0) >= 35 ? "text-pump-active" : "text-muted-foreground"
                      }`}>
                        {item.manipulation != null ? `${item.manipulation}%` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {(() => {
                          const l = liq?.[item.symbol];
                          const total = l ? l.long5 + l.short5 : 0;
                          if (!total) return <span className="text-muted-foreground">—</span>;
                          const lead = l.short5 > l.long5 * 2.5 && l.short5 > 250000 ? "short"
                            : l.long5 > l.short5 * 2.5 && l.long5 > 250000 ? "long" : null;
                          return (
                            <span
                              title={`long $${formatVolume(l.long5)} · short $${formatVolume(l.short5)}`}
                              className={`inline-flex items-center gap-1 ${lead === "short" ? "text-chart-green" : lead === "long" ? "text-destructive" : "text-muted-foreground"}`}>
                              {lead && <Flame className="w-3 h-3" />}${formatVolume(total)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-center">
                        <Badge className={`text-[10px] ${statusColors[item.status] || statusColors.INACTIVE}`}>
                          {item.status || "INACTIVE"}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                        {formatVolume(item.quoteVolume)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}