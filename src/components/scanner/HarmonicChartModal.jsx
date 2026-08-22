import React, { useEffect, useMemo, useRef, useState } from "react";
import { createChart, ColorType, LineStyle, CrosshairMode } from "lightweight-charts";
import { X, ExternalLink, Loader2, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeHarmonics, PIVOT_PRESETS } from "@/lib/harmonicEngine";
import { exchangeName, DEFAULT_EXCHANGE } from "@/lib/exchanges";

const TIMEFRAMES = ["15m", "1h", "4h", "1d"];
const TF_SECONDS = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };

const fmt = (v) => (v == null || !isFinite(v) ? "—" : v >= 1 ? v.toFixed(4) : v.toPrecision(4));

export default function HarmonicChartModal({ pair, timeframe = "1h", fetchKlinesFn, onClose }) {
  const [tf, setTf] = useState(timeframe);
  const [preset, setPreset] = useState("fast");
  const [klines, setKlines] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patternIdx, setPatternIdx] = useState(0);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const harmonicLineRef = useRef(null);
  const priceLinesRef = useRef([]);

  const exchange = pair?.exchange || DEFAULT_EXCHANGE;
  const tvPrefix = exchange === "bybit" ? "BYBIT:" : "BINANCE:";
  const tvSuffix = exchange === "bybit" ? ".P" : "";
  const tvSymbol = `${tvPrefix}${pair?.symbol}${tvSuffix}`;

  // Fetch klines when pair/timeframe changes.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setKlines(null);
    (async () => {
      try {
        const data = await fetchKlinesFn(pair.symbol, tf, 200);
        if (alive) setKlines(data || []);
      } catch {
        if (alive) setKlines([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [pair.symbol, tf, fetchKlinesFn]);

  // Crash-safe harmonic analysis.
  const analysis = useMemo(() => {
    if (!klines || klines.length < 20) return null;
    try { return analyzeHarmonics(klines, preset); } catch { return { patterns: [], best: null, pivotCount: 0 }; }
  }, [klines, preset]);

  const patterns = analysis?.patterns || [];
  const activePattern = patterns[Math.min(patternIdx, patterns.length - 1)] || null;
  useEffect(() => { setPatternIdx(0); }, [pair.symbol, tf, preset, analysis]);

  const bullish = activePattern?.bullish;
  const lineColor = bullish ? "#26A69A" : "#EF5350";

  // Create the chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0e14" },
        textColor: "#848e9c",
        fontFamily: "JetBrains Mono, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
      },
    });
    const candle = chart.addCandlestickSeries({
      upColor: "#26A69A", downColor: "#EF5350",
      wickUpColor: "#26A69A", wickDownColor: "#EF5350",
      borderVisible: false,
    });
    chartRef.current = chart;
    candleRef.current = candle;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      harmonicLineRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // Feed candle data.
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle || !klines || !klines.length) return;
    candle.setData(klines.map(k => ({
      time: Math.floor(k.time / 1000),
      open: k.open, high: k.high, low: k.low, close: k.close,
    })));
    chart.timeScale().fitContent();
  }, [klines]);

  // (Re)draw harmonic overlay + price lines whenever pattern/klines change.
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle || !klines || !klines.length) return;

    // Clean previous overlay & price lines.
    if (harmonicLineRef.current) {
      chart.removeSeries(harmonicLineRef.current);
      harmonicLineRef.current = null;
    }
    priceLinesRef.current.forEach(pl => { try { candle.removePriceLine(pl); } catch {} });
    priceLinesRef.current = [];

    if (!activePattern) {
      candle.setMarkers([]);
      return;
    }

    const p = activePattern;
    const intervalSec = TF_SECONDS[tf] || 3600;
    const lastTime = Math.floor(klines[klines.length - 1].time / 1000);

    // Resolve pivot times (seconds). Projected D for potential patterns.
    const resolveTime = (bar) => {
      if (bar == null || bar < 0 || bar >= klines.length) return null;
      return Math.floor(klines[bar].time / 1000);
    };
    const tX = resolveTime(p.bars.bX);
    const tA = resolveTime(p.bars.bA);
    const tB = resolveTime(p.bars.bB);
    const tC = resolveTime(p.bars.bC);
    const tD = p.completed ? resolveTime(p.bars.bD) : (tC != null ? tC + intervalSec * 2 : lastTime + intervalSec * 2);

    // Pattern polyline series.
    const linePoints = [
      { t: tX, v: p.pivots.X, label: "X" },
      { t: tA, v: p.pivots.A, label: "A" },
      { t: tB, v: p.pivots.B, label: "B" },
      { t: tC, v: p.pivots.C, label: "C" },
      { t: tD, v: p.pivots.D, label: "D" },
    ].filter(pt => pt.t != null && pt.v != null);

    const lineSeries = chart.addLineSeries({
      color: lineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      pointMarkersVisible: false,
    });
    lineSeries.setData(linePoints.map(pt => ({ time: pt.t, value: pt.v })));
    harmonicLineRef.current = lineSeries;

    // Markers X-A-B-C-D on the candle series (symbol labels).
    const posHigh = bullish ? "aboveBar" : "belowBar";
    const posLow = bullish ? "belowBar" : "aboveBar";
    // Direction alternation: bullish => X(low),A(high),B(low),C(high),D(low). Bear: opposite.
    const dirSeq = bullish ? [posLow, posHigh, posLow, posHigh, posLow] : [posHigh, posLow, posHigh, posLow, posHigh];
    const markers = linePoints.map((pt, i) => ({
      time: pt.t,
      position: dirSeq[i],
      color: lineColor,
      shape: "circle",
      size: 1,
      text: pt.label,
    }));
    candle.setMarkers(markers);

    // Price lines: PRZ top/bottom, Entry, SL, TP1/TP2/TP3.
    const addLine = (price, color, title, style, width) => {
      if (price == null || !isFinite(price)) return;
      const pl = candle.createPriceLine({
        price, color, lineWidth: width ?? 1, lineStyle: style ?? LineStyle.Dashed,
        axisLabelVisible: true, title,
      });
      if (pl) priceLinesRef.current.push(pl);
    };
    addLine(p.przZone.top, "#9C27B0", "PRZ↑", LineStyle.Dashed, 1);
    addLine(p.przZone.bottom, "#9C27B0", "PRZ↓", LineStyle.Dashed, 1);
    addLine(p.entry, "#FFFFFF", "Entry", LineStyle.Dotted, 2);
    addLine(p.sl, "#EF5350", "SL", LineStyle.Dashed, 1);
    addLine(p.tp1, "#26A69A", "TP1", LineStyle.Dashed, 1);
    addLine(p.tp2, "#26A69A", "TP2", LineStyle.Dashed, 1);
    addLine(p.tp3, "#26A69A", "TP3", LineStyle.LargeDashed, 1);
  }, [activePattern, klines, tf]);

  const hasData = klines && klines.length >= 20;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-6xl mx-4 overflow-hidden flex flex-col"
        style={{ maxHeight: "92vh", height: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold font-mono text-lg">{pair?.symbol?.replace("USDT", "")}/USDT</span>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{exchangeName(exchange)} · {tf}</span>
            {activePattern ? (
              <Badge variant="outline" className={`text-[10px] ${bullish ? "border-chart-green/50 text-chart-green" : "border-chart-red/50 text-chart-red"}`}>
                <Hexagon className="w-3 h-3 mr-1" />
                {bullish ? "▲ BULLISH" : "▼ BEARISH"} {activePattern.name} · {activePattern.conf}% {activePattern.grade} · {activePattern.status}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">🦋 Niciun tipar pe {tf}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a href={`https://www.tradingview.com/chart/?symbol=${tvSymbol}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1" /> Deschide TradingView</Button>
            </a>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
          <div className="flex gap-1">
            {TIMEFRAMES.map(t => (
              <Button key={t} size="sm" variant={t === tf ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setTf(t)}>{t}</Button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground ml-2">Sensibilitate pivots:</span>
          <div className="flex gap-1">
            {Object.keys(PIVOT_PRESETS).map(p => (
              <Button key={p} size="sm" variant={p === preset ? "secondary" : "ghost"} className="h-7 px-2 text-xs capitalize" onClick={() => setPreset(p)}>{p}</Button>
            ))}
          </div>
          {patterns.length > 1 && (
            <>
              <span className="text-[10px] text-muted-foreground ml-2">Tipare ({patterns.length}):</span>
              <div className="flex gap-1 flex-wrap">
                {patterns.map((p, i) => (
                  <Button key={i} size="sm" variant={i === patternIdx ? "secondary" : "ghost"} className="h-7 px-2 text-[10px]" onClick={() => setPatternIdx(i)}>
                    {p.bullish ? "▲" : "▼"} {p.name} {p.conf}%
                  </Button>
                ))}
              </div>
            </>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground hidden sm:inline">drag = scroll istoric · scroll = zoom</span>
        </div>

        {/* Chart */}
        <div className="flex-1 relative p-3 min-h-0">
          {/* Container always mounted so the chart instance (created on mount) has a target. */}
          <div ref={containerRef} className="w-full h-full" />
          {(loading || !klines) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-card">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Încărcare klines {pair?.symbol} · {tf}...</p>
            </div>
          )}
          {!loading && klines && !hasData && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm bg-card">
              Date insuficiente pe {tf} pentru detecție armonică.
            </div>
          )}
        </div>

        {/* Footer info */}
        {activePattern && hasData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 px-4 py-2 border-t border-border text-[10px] font-mono">
            <InfoBox label="PRZ Zonă" value={`${fmt(activePattern.przZone.bottom)} – ${fmt(activePattern.przZone.top)}`} color="text-chart-purple" />
            <InfoBox label="Entry" value={fmt(activePattern.entry)} color="text-foreground" />
            <InfoBox label="Stop Loss" value={fmt(activePattern.sl)} color="text-chart-red" />
            <InfoBox label="TP1 / TP2 / TP3" value={`${fmt(activePattern.tp1)} / ${fmt(activePattern.tp2)} / ${fmt(activePattern.tp3)}`} color="text-chart-green" />
            <InfoBox label="R:R (TP2)" value={`1:${(activePattern.rr || 0).toFixed(2)}`} color="text-chart-gold" />
            <InfoBox label="Conf / Fit / PRZ" value={`${activePattern.conf}% / ${Math.round(activePattern.fit)}% / ${Math.round(activePattern.prz)}%`} color="text-chart-gold" />
            <InfoBox label="XAB" value={`${(activePattern.ratios.rAB || 0).toFixed(3)} ${activePattern.checks.okAB ? "✔" : "✖"}`} color={activePattern.checks.okAB ? "text-chart-green" : "text-muted-foreground"} />
            <InfoBox label="ABC" value={`${(activePattern.ratios.rBC || 0).toFixed(3)} ${activePattern.checks.okBC ? "✔" : "✖"}`} color={activePattern.checks.okBC ? "text-chart-green" : "text-muted-foreground"} />
            <InfoBox label="BCD" value={`${(activePattern.ratios.rCD || 0).toFixed(3)} ${activePattern.checks.okCD ? "✔" : "✖"}`} color={activePattern.checks.okCD ? "text-chart-green" : "text-muted-foreground"} />
            <InfoBox label="XAD" value={`${(activePattern.ratios.rAD || 0).toFixed(3)} ${activePattern.checks.okAD ? "✔" : "✖"}`} color={activePattern.checks.okAD ? "text-chart-green" : "text-muted-foreground"} />
          </div>
        )}
      </div>
    </div>
  );
}

function InfoBox({ label, value, color = "text-foreground" }) {
  return (
    <div className="bg-secondary/40 border border-border/40 rounded px-2 py-1">
      <p className="text-muted-foreground uppercase text-[8px]">{label}</p>
      <p className={color}>{value}</p>
    </div>
  );
}