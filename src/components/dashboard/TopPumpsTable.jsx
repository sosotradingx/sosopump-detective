import React from "react";
import { formatPrice, formatVolume } from "../scanner/binanceApi";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

const statusColors = {
  STRONG: "bg-pump-strong/20 text-pump-strong border-pump-strong/30",
  ACTIVE: "bg-pump-active/20 text-pump-active border-pump-active/30",
  WEAK: "bg-pump-weak/20 text-pump-weak border-pump-weak/30",
  EARLY: "bg-pump-early/20 text-pump-early border-pump-early/30",
  INACTIVE: "bg-pump-inactive/20 text-pump-inactive border-pump-inactive/30",
};

export default function TopPumpsTable({ data, onSelectPair }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
        Se încarcă datele...
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => (b.analysis?.totalScore || 0) - (a.analysis?.totalScore || 0));
  const top = sorted.slice(0, 10);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold">🔥 Top Pump Signals</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left p-3 font-medium">Pereche</th>
              <th className="text-right p-3 font-medium">Preț</th>
              <th className="text-right p-3 font-medium">24h %</th>
              <th className="text-right p-3 font-medium">Score</th>
              <th className="text-center p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Volum</th>
            </tr>
          </thead>
          <tbody>
            {top.map(item => {
              const a = item.analysis || {};
              const positive = item.priceChangePercent >= 0;
              return (
                <tr
                  key={item.symbol}
                  className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => onSelectPair?.(item.symbol)}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{a.pumpEmoji || "⚫"}</span>
                      <div>
                        <p className="font-semibold font-mono">{item.symbol.replace("USDT", "")}</p>
                        <p className="text-[10px] text-muted-foreground">/ USDT</p>
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
                      a.totalScore >= 70 ? "text-pump-strong" :
                      a.totalScore >= 40 ? "text-pump-active" :
                      a.totalScore >= 20 ? "text-pump-weak" : "text-muted-foreground"
                    }`}>
                      {a.totalScore || 0}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <Badge className={`text-[10px] ${statusColors[a.pumpStatus] || statusColors.INACTIVE}`}>
                      {a.pumpStatus || "INACTIVE"}
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
    </div>
  );
}