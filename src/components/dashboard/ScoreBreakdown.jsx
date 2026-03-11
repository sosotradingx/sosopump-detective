import React from "react";

function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{value}</span>
    </div>
  );
}

export default function ScoreBreakdown({ analysis }) {
  if (!analysis) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold mb-3">📊 Score Breakdown</h3>
      <BarRow label="Volum" value={analysis.volScore || 0} max={35} color="bg-chart-blue" />
      <BarRow label="Momentum" value={analysis.momentumScore || 0} max={25} color="bg-chart-green" />
      <BarRow label="Avansat" value={analysis.advancedScore || 0} max={35} color="bg-chart-purple" />
      <BarRow label="Trend" value={analysis.trendOk ? 10 : 0} max={10} color="bg-pump-active" />
      <BarRow label="Regim" value={analysis.isTrending ? 10 : analysis.isRanging ? 5 : 7} max={10} color="bg-chart-gold" />
      <div className="border-t border-border pt-3 mt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Total Score</span>
          <span className={`text-2xl font-bold font-mono ${
            analysis.totalScore >= 70 ? "text-pump-strong" :
            analysis.totalScore >= 40 ? "text-pump-active" : "text-muted-foreground"
          }`}>
            {analysis.totalScore}%
          </span>
        </div>
      </div>
    </div>
  );
}