import React from "react";
import MarketRegimeBadge from "../dashboard/MarketRegimeBadge";

function Indicator({ label, active, value, emoji }) {
  return (
    <div className={`flex items-center justify-between p-2 rounded-lg border ${
      active ? "bg-pump-strong/10 border-pump-strong/20" : "bg-secondary/30 border-border"
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {value !== undefined && <span className="text-xs font-mono text-muted-foreground">{value}</span>}
        <span className={`text-xs font-bold ${active ? "text-pump-strong" : "text-pump-inactive"}`}>
          {active ? "✅" : "⚪"}
        </span>
      </div>
    </div>
  );
}

export default function IndicatorPanel({ analysis }) {
  if (!analysis) return null;
  
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">📡 Indicatori</h3>
        <MarketRegimeBadge regime={analysis.marketRegime} />
      </div>
      
      <div className="space-y-2">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Early Detection</p>
        <Indicator label="Volume Accumulation" active={analysis.volAccum} emoji="📊" />
        <Indicator label="EMA Cross" active={analysis.emaCross} emoji="↑" />
        <Indicator label="MACD Bullish" active={analysis.macdBullish} emoji="↗" />
        <Indicator label="BB Squeeze" active={analysis.isSqueeze} value={`W: ${(analysis.bbWidth * 100).toFixed(2)}%`} emoji="🔶" />
        <Indicator label="ADX Rising" active={analysis.adxRising} value={`${analysis.adx}`} emoji="📈" />
        <Indicator label="OBV Divergence" active={analysis.obvDivergence} emoji="📈" />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Status</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/30 rounded-lg p-2">
            <p className="text-[10px] text-muted-foreground">RSI</p>
            <p className={`text-lg font-bold font-mono ${
              analysis.rsi >= 75 ? "text-chart-red" : analysis.rsi >= 60 ? "text-pump-active" : "text-chart-green"
            }`}>{analysis.rsi}</p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-2">
            <p className="text-[10px] text-muted-foreground">ATR %</p>
            <p className="text-lg font-bold font-mono text-chart-blue">{analysis.atrPercent}%</p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-2">
            <p className="text-[10px] text-muted-foreground">Vol Spike</p>
            <p className={`text-lg font-bold font-mono ${analysis.volumeSpike ? "text-pump-strong" : "text-muted-foreground"}`}>
              {analysis.volumeSpikeVal}x
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-2">
            <p className="text-[10px] text-muted-foreground">Pump %</p>
            <p className={`text-lg font-bold font-mono ${analysis.pumpPercent > 0 ? "text-chart-green" : "text-chart-red"}`}>
              {analysis.pumpPercent > 0 ? "+" : ""}{analysis.pumpPercent}%
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Exit Signals</p>
        <Indicator label="RSI Extreme" active={analysis.exitSignals?.rsiExtreme} emoji="🔴" />
        <Indicator label="Volume Fade" active={analysis.exitSignals?.volumeFade} emoji="📉" />
        <Indicator label="ADX Exhaustion" active={analysis.exitSignals?.adxExhaustion} emoji="⚡" />
      </div>
    </div>
  );
}