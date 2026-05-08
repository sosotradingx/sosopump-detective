import React, { useState, useEffect, useCallback } from "react";
import { fetchKlines, fetchTopPairs, formatPrice } from "../scanner/binanceApi";
import { analyzePump } from "../scanner/pumpEngine";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, TrendingUp, TrendingDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const TF_OPTIONS = ["1m", "5m", "15m", "1h", "4h", "1d"];

const CHART_COLORS = [
  { stroke: "#f97316", fill: "#f97316" },
  { stroke: "#3b82f6", fill: "#3b82f6" },
  { stroke: "#a855f7", fill: "#a855f7" },
  { stroke: "#22c55e", fill: "#22c55e" },
];

const STATUS_STYLE = {
  STRONG:   "bg-pump-strong/20 text-pump-strong border-pump-strong/30",
  ACTIVE:   "bg-pump-active/20 text-pump-active border-pump-active/30",
  WEAK:     "bg-pump-weak/20 text-pump-weak border-pump-weak/30",
  EARLY:    "bg-pump-early/20 text-pump-early border-pump-early/30",
  INACTIVE: "bg-secondary text-muted-foreground border-border",
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-mono font-semibold">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(6) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function ChartPanel({ index, symbol, timeframe, onSymbolChange, onTimeframeChange, availablePairs, colorIndex = 0, isExpanded, chartHeight = 220 }) {
  const [klines, setKlines] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastPrice, setLastPrice] = useState(null);
  const [showVolume, setShowVolume] = useState(false);

  const color = CHART_COLORS[colorIndex % CHART_COLORS.length];

  const loadKlines = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    const data = await fetchKlines(symbol, timeframe, 80);
    setKlines(data);
    setLastPrice(data.length > 0 ? data[data.length - 1].close : null);
    const a = analyzePump(data);
    setAnalysis(a);
    setLoading(false);
  }, [symbol, timeframe]);

  useEffect(() => {
    loadKlines();
    const interval = setInterval(loadKlines, 30000);
    return () => clearInterval(interval);
  }, [loadKlines]);

  const chartData = klines.map((k) => ({
    t: new Date(k.time).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
    price: k.close,
    volume: k.volume,
    high: k.high,
    low: k.low,
  }));

  const minP = chartData.length ? Math.min(...chartData.map(d => d.low)) * 0.997 : 0;
  const maxP = chartData.length ? Math.max(...chartData.map(d => d.high)) * 1.003 : 1;

  const priceChange = klines.length >= 2
    ? ((klines[klines.length - 1].close - klines[0].close) / klines[0].close) * 100
    : 0;
  const positive = priceChange >= 0;

  return (
    <div className={`bg-card border rounded-xl flex flex-col overflow-hidden transition-all ${
      analysis?.pumpStatus === "STRONG" ? "border-pump-strong/40 shadow-pump-strong/10 shadow-lg" :
      analysis?.pumpStatus === "ACTIVE" ? "border-pump-active/40" :
      analysis?.hasEarlyWarning ? "border-pump-early/30" :
      "border-border"
    }`}>
      {/* Panel Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/30">
        {/* Index badge */}
        <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: color.stroke + "22", color: color.stroke }}>
          {index + 1}
        </span>

        {/* Symbol selector */}
        <Select value={symbol} onValueChange={onSymbolChange}>
          <SelectTrigger className="h-7 text-xs font-mono font-bold bg-transparent border-0 p-0 w-28 focus:ring-0">
            <SelectValue placeholder="Alege pereche" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {availablePairs.map(s => (
              <SelectItem key={s} value={s} className="text-xs font-mono">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Price */}
        {lastPrice && (
          <span className="text-xs font-mono font-semibold text-foreground">
            ${formatPrice(lastPrice)}
          </span>
        )}

        {/* Change */}
        {klines.length > 1 && (
          <span className={`text-[10px] font-mono font-medium flex items-center gap-0.5 ${positive ? "text-chart-green" : "text-chart-red"}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? "+" : ""}{priceChange.toFixed(2)}%
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Pump status */}
          {analysis && (
            <Badge variant="outline" className={`text-[9px] h-5 px-1.5 ${STATUS_STYLE[analysis.pumpStatus] || STATUS_STYLE.INACTIVE}`}>
              {analysis.pumpEmoji} {analysis.totalScore}
            </Badge>
          )}

          {/* TF selector */}
          <Select value={timeframe} onValueChange={onTimeframeChange}>
            <SelectTrigger className="h-6 w-14 text-[10px] font-mono bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TF_OPTIONS.map(tf => (
                <SelectItem key={tf} value={tf} className="text-xs font-mono">{tf}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Volume toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 text-[10px] ${showVolume ? "text-primary" : "text-muted-foreground"}`}
            onClick={() => setShowVolume(v => !v)}
            title="Toggle Volume"
          >
            <span className="text-[8px] font-mono font-bold">VOL</span>
          </Button>

          {/* Refresh */}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadKlines} disabled={loading}>
            {loading
              ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              : <RefreshCw className="w-3 h-3 text-muted-foreground" />
            }
          </Button>
        </div>
      </div>

      {/* Indicators strip */}
      {analysis && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/20 border-b border-border/50 flex-wrap">
          {[
            { key: "volAccum", label: "VOL" },
            { key: "emaCross", label: "EMA" },
            { key: "macdBullish", label: "MACD" },
            { key: "isSqueeze", label: "SQZ" },
            { key: "adxRising", label: "ADX" },
            { key: "obvDivergence", label: "OBV" },
          ].map(({ key, label }) => (
            <span key={key} className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-medium ${
              analysis[key] ? "bg-chart-green/20 text-chart-green" : "bg-secondary text-muted-foreground/50"
            }`}>
              {label}
            </span>
          ))}
          <span className={`ml-auto text-[9px] font-mono ${
            analysis.rsi >= 75 ? "text-chart-red" : analysis.rsi >= 60 ? "text-pump-active" : "text-chart-green"
          }`}>
            RSI {analysis.rsi}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">
            {analysis.marketRegime}
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="p-2" style={{ height: chartHeight }}>
        {loading && klines.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Selectează o pereche
          </div>
        ) : (
          <div className="h-full flex flex-col gap-1">
            <ResponsiveContainer width="100%" height={showVolume ? "72%" : "100%"}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color.fill} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={color.fill} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,30%,15%)" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: "hsl(215,20%,45%)" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis domain={[minP, maxP]} tick={{ fontSize: 9, fill: "hsl(215,20%,45%)" }} axisLine={false} tickLine={false} width={55} tickFormatter={v => formatPrice(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  name="Preț"
                  stroke={color.stroke}
                  fill={`url(#grad-${index})`}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: color.stroke }}
                />
              </AreaChart>
            </ResponsiveContainer>

            {showVolume && (
              <ResponsiveContainer width="100%" height="28%">
                <BarChart data={chartData} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,30%,15%)" vertical={false} />
                  <XAxis dataKey="t" tick={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 8, fill: "hsl(215,20%,45%)" }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="volume" name="Volum" fill={color.stroke} opacity={0.5} radius={[1, 1, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Exit signals footer */}
      {analysis && (analysis.exitSignals?.rsiExtreme || analysis.exitSignals?.volumeFade) && (
        <div className="px-3 py-1.5 bg-chart-red/10 border-t border-chart-red/20 flex items-center gap-2">
          <span className="text-[9px] font-mono text-chart-red font-semibold">⚠ EXIT SIGNALS:</span>
          {analysis.exitSignals.rsiExtreme && <span className="text-[9px] text-chart-red font-mono">RSI Extrem</span>}
          {analysis.exitSignals.volumeFade && <span className="text-[9px] text-chart-red font-mono">Vol Fade</span>}
        </div>
      )}
    </div>
  );
}