import React from "react";
import { formatPrice, formatVolume } from "./binanceApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Eye, Star, TrendingUp, TrendingDown } from "lucide-react";
import ScoreBreakdown from "@/components/dashboard/ScoreBreakdown";

export default function PairDetailPanel({ pair, isFavorite, onToggleFavorite, onOpenChart, onClose }) {
  if (!pair) return null;
  const a = pair.analysis || {};
  const positive = pair.priceChangePercent >= 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel - slides up from bottom on mobile, right sidebar on desktop */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl p-4 space-y-4 max-h-[85vh] overflow-y-auto
                      lg:top-0 lg:bottom-0 lg:left-auto lg:right-0 lg:w-96 lg:border-t-0 lg:border-l lg:rounded-t-none lg:rounded-l-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{a.pumpEmoji || "⚫"}</span>
            <div>
              <h2 className="text-lg font-bold font-mono">{pair.symbol}</h2>
              <p className={`text-sm font-mono ${positive ? "text-chart-green" : "text-chart-red"}`}>
                {positive ? "+" : ""}{pair.priceChangePercent.toFixed(2)}% · ${formatPrice(pair.price)}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Status + Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {a.pumpStatus || "INACTIVE"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => onToggleFavorite?.()}>
            <Star className={`w-4 h-4 mr-1 ${isFavorite ? "fill-chart-gold text-chart-gold" : ""}`} />
            {isFavorite ? "Favorit" : "Adaugă favorit"}
          </Button>
          <Button size="sm" className="bg-primary" onClick={() => { onClose(); onOpenChart(pair.symbol); }}>
            <Eye className="w-4 h-4 mr-1" /> Grafic
          </Button>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-mono">Volum 24h</p>
            <p className="text-base font-bold font-mono">{formatVolume(pair.quoteVolume)}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-mono">Vol. Spike</p>
            <p className={`text-base font-bold font-mono ${a.volumeSpike ? "text-chart-green" : ""}`}>{a.volumeSpikeVal || 0}x</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-mono">RSI</p>
            <p className={`text-base font-bold font-mono ${a.rsi >= 70 ? "text-chart-red" : a.rsi <= 30 ? "text-chart-green" : ""}`}>{a.rsi || "-"}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-mono">ADX</p>
            <p className={`text-base font-bold font-mono ${a.adx >= 25 ? "text-pump-strong" : ""}`}>{a.adx || "-"}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-mono">ATR %</p>
            <p className="text-base font-bold font-mono">{a.atrPercent || 0}%</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-mono">Market</p>
            <p className={`text-base font-bold font-mono ${a.isTrending ? "text-pump-strong" : a.isRanging ? "text-muted-foreground" : "text-pump-active"}`}>
              {a.marketRegime || "-"}
            </p>
          </div>
        </div>

        {/* Signals */}
        <div className="bg-secondary/30 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase font-mono mb-2">Semnale Active</p>
          <div className="flex flex-wrap gap-2">
            {a.volAccum && <Badge variant="outline" className="text-[10px]">📊 Vol. Accum</Badge>}
            {a.emaCross && <Badge variant="outline" className="text-[10px]">↑ EMA Cross</Badge>}
            {a.macdBullish && <Badge variant="outline" className="text-[10px]">↗ MACD</Badge>}
            {a.isSqueeze && <Badge variant="outline" className="text-[10px]">🔶 BB Squeeze</Badge>}
            {a.adxRising && <Badge variant="outline" className="text-[10px]">📈 ADX Rising</Badge>}
            {a.obvDivergence && <Badge variant="outline" className="text-[10px]">📈 OBV Div</Badge>}
            {a.volumeSpike && <Badge variant="outline" className="text-[10px]">⚡ Vol Spike</Badge>}
            {a.trendOk && <Badge variant="outline" className="text-[10px]">✅ Trend OK</Badge>}
            {!a.volAccum && !a.emaCross && !a.macdBullish && !a.isSqueeze && !a.adxRising && !a.obvDivergence && !a.volumeSpike && (
              <span className="text-xs text-muted-foreground">Niciun semnal activ</span>
            )}
          </div>
        </div>

        {/* Score Breakdown */}
        <ScoreBreakdown analysis={a} />
      </div>
    </>
  );
}