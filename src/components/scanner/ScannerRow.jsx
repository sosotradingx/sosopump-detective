import React from "react";
import { formatPrice, formatVolume } from "./binanceApi";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Eye, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

const statusConfig = {
  STRONG:   { bg: "bg-pump-strong/10",   text: "text-pump-strong",   border: "border-pump-strong/30" },
  ACTIVE:   { bg: "bg-pump-active/10",   text: "text-pump-active",   border: "border-pump-active/30" },
  WEAK:     { bg: "bg-pump-weak/10",     text: "text-pump-weak",     border: "border-pump-weak/30" },
  EARLY:    { bg: "bg-pump-early/10",    text: "text-pump-early",    border: "border-pump-early/30" },
  INACTIVE: { bg: "bg-muted/10",         text: "text-muted-foreground", border: "border-border" },
};

export default function ScannerRow({ pair, onSelect, onRowClick, isFavorite, onToggleFavorite }) {
  const a = pair.analysis || {};
  const sc = statusConfig[a.pumpStatus] || statusConfig.INACTIVE;
  const positive = pair.priceChangePercent >= 0;

  return (
    <tr className="border-b border-border/30 hover:bg-accent/30 transition-colors text-sm cursor-pointer" onClick={() => onRowClick?.(pair)}>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{a.pumpEmoji || "⚫"}</span>
          <div>
            <p className="font-semibold font-mono text-xs">{pair.symbol.replace("USDT", "")}</p>
            <p className="text-[9px] text-muted-foreground">/USDT</p>
          </div>
        </div>
      </td>
      <td className="p-3 text-right font-mono text-xs">{formatPrice(pair.price)}</td>
      <td className={`p-3 text-right font-mono text-xs font-medium ${positive ? "text-chart-green" : "text-chart-red"}`}>
        <span className="flex items-center justify-end gap-0.5">
          {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {positive ? "+" : ""}{pair.priceChangePercent.toFixed(2)}%
        </span>
      </td>
      <td className="p-3 text-center">
        <span className={`font-mono font-bold text-base ${
          a.totalScore >= 70 ? "text-pump-strong" :
          a.totalScore >= 40 ? "text-pump-active" :
          a.totalScore >= 20 ? "text-pump-weak" : "text-muted-foreground"
        }`}>
          {a.totalScore || 0}
        </span>
      </td>
      <td className="p-3 text-center">
        <Badge variant="outline" className={`text-[10px] ${sc.bg} ${sc.text} ${sc.border}`}>
          {a.pumpStatus || "INACTIVE"}
        </Badge>
      </td>
      <td className="p-3 text-center text-xs">
        <span className={`font-mono ${a.volumeSpike ? "text-chart-green font-semibold" : "text-muted-foreground"}`}>
          {a.volumeSpikeVal || 0}x
        </span>
      </td>
      <td className="p-3 text-center text-xs">{a.rsi || "-"}</td>
      <td className="p-3 text-center text-xs">
        <span className={a.isTrending ? "text-pump-strong" : a.isRanging ? "text-pump-inactive" : "text-pump-active"}>
          {a.marketRegime || "-"}
        </span>
      </td>
      <td className="p-3 text-center">
        <div className="flex gap-1 justify-center">
          {a.volAccum && <span className="text-[9px]" title="Volume Accumulation">📊</span>}
          {a.emaCross && <span className="text-[9px]" title="EMA Cross">↑</span>}
          {a.macdBullish && <span className="text-[9px]" title="MACD">↗</span>}
          {a.isSqueeze && <span className="text-[9px]" title="BB Squeeze">🔶</span>}
          {a.adxRising && <span className="text-[9px]" title="ADX Rising">📈</span>}
          {a.obvDivergence && <span className="text-[9px]" title="OBV Div">📈</span>}
        </div>
      </td>
      <td className="p-3 text-right font-mono text-xs text-muted-foreground">
        {formatVolume(pair.quoteVolume)}
      </td>
      <td className="p-3 text-center">
        <div className="flex items-center gap-1 justify-center">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }}>
            <Star className={`w-3 h-3 ${isFavorite ? "fill-chart-gold text-chart-gold" : "text-muted-foreground"}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onSelect?.(pair.symbol); }}>
            <Eye className="w-3 h-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}