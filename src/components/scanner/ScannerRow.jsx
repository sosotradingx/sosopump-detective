import React from "react";
import { formatPrice, formatVolume } from "./binanceApi";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Eye, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

...

export default function ScannerRow({ pair, onSelect, isFavorite, onToggleFavorite }) {
  const a = pair.analysis || {};
  const sc = statusConfig[a.pumpStatus] || statusConfig.INACTIVE;
  const positive = pair.priceChangePercent >= 0;

  return (
    <tr className="border-b border-border/30 hover:bg-accent/30 transition-colors text-sm">
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
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSelect?.(pair.symbol)}>
          <Eye className="w-3 h-3" />
        </Button>
      </td>
    </tr>
  );
}