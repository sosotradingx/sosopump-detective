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
  const levelSeriesRef = useRef([]);

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
      levelSeriesRef.current = [];
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

    // Clean previous overlay, price lines & level series.
    if (harmonicLineRef.current) {
      chart.removeSeries(harmonicLineRef.current);
      harmonicLineRef.current = null;
    }
    priceLinesRef.current.forEach(pl => { try { candle.removePriceLine(pl); } catch {} });
    priceLinesRef.current = [];
    levelSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    levelSeriesRef.current = [];

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

    // Level lines drawn INTO the chart from the D point (detection / entry) forward,
    // so they don't span the whole history and don't clutter the right price axis.
    const endT = lastTime + intervalSec * 10;
    const startT = tD != null ? tD : lastTime;
    const addLevelLine = (price, color, style, width) => {
      if (price == null || !isFinite(price)) return;
      const s = chart.addLineSeries({
        color, lineWidth: width ?? 1, lineStyle: style ?? LineStyle.Dashed,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, pointMarkersVisible: false,
      });
      s.setData([{ time: startT, value: price }, { time: endT, value: price }]);
      levelSeriesRef.current.push(s);
    };
    addLevelLine(p.przZone.top, "#9C27B0", LineStyle.Dashed, 1);
    addLevelLine(p.przZone.bottom, "#9C27B0", LineStyle.Dashed, 1);
    addLevelLine(p.entry, "#FFFFFF", LineStyle.Dotted, 2);
    addLevelLine(p.sl, "#EF5350", LineStyle.Dashed, 1);
    addLevelLine(p.tp1, "#26A69A", LineStyle.Dashed, 1);
    addLevelLine(p.tp2, "#26A69A", LineStyle.Dashed, 1);
    addLevelLine(p.tp3, "#26A69A", LineStyle.LargeDashed, 1);
  }, [activePattern, klines, tf]);

  const hasData = klines && klines.length >= 20;
  const curPrice = klines && klines.length ? klines[klines.length - 1].close : null;

  // Trade status: Waiting (D not formed) / Active (in trade) / TP Hit / SL Hit.
  const tradeStatus = useMemo(() => {
    if (!activePattern || curPrice == null) return null;
    const p = activePattern;
    if (!p.completed) return { label: "Waiting", desc: "Aşteaptă formarea punctului D", color: "text-chart-blue", bg: "bg-chart-blue/15", dot: "bg-chart-blue" };
    const bull = p.bullish;
    const hitSL = bull ? curPrice <= p.sl : curPrice >= p.sl;
    const hitTP = bull ? curPrice >= p.tp2 : curPrice <= p.tp2;
    if (hitSL) return { label: "SL Hit", desc: "Stop-loss atins", color: "text-chart-red", bg: "bg-chart-red/15", dot: "bg-chart-red" };
    if (hitTP) return { label: "TP Hit", desc: "Target atins", color: "text-chart-green", bg: "bg-chart-green/15", dot: "bg-chart-green" };
    return { label: "Active", desc: "Tranzacţie activă", color: "text-chart-gold", bg: "bg-chart-gold/15", dot: "bg-chart-gold" };
  }, [activePattern, curPrice]);

  // Progress bar: SL (0%) → Entry → TP2 (100%), current price marker.
  const progress = useMemo(() => {
    if (!activePattern || curPrice == null) return null;
    const p = activePattern;
    const span = Math.abs(p.tp2 - p.sl) || 1;
    const bull = p.bullish;
    const norm = (v) => bull ? (v - p.sl) / span : (p.sl - v) / span;
    const posPct = Math.max(0, Math.min(100, norm(curPrice) * 100));
    const entryPct = Math.max(0, Math.min(100, norm(p.entry) * 100));
    return { posPct, entryPct };
  }, [activePattern, curPrice]);

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

        {/* Trade status + progress bar */}
        {activePattern && hasData && tradeStatus && progress && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-border">
            <Badge variant="outline" className={`text-[10px] ${tradeStatus.bg} ${tradeStatus.color} border-border/50`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tradeStatus.dot} mr-1 ${tradeStatus.label === "Active" ? "animate-pulse" : ""}`} />
              {tradeStatus.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground hidden md:inline">{tradeStatus.desc}</span>
            <div className="flex-1 relative h-2.5 bg-secondary rounded overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-chart-red/30" style={{ width: `${progress.entryPct}%` }} />
              <div className="absolute inset-y-0 bg-chart-green/25" style={{ left: `${progress.entryPct}%`, right: 0 }} />
              <div className="absolute inset-y-0 w-px bg-white/80" style={{ left: `${progress.entryPct}%` }} />
              <div className="absolute inset-y-0 w-1.5 bg-primary rounded-sm -ml-0.5" style={{ left: `${progress.posPct}%` }} />
            </div>
            <span className="text-[10px] font-mono text-chart-red">SL</span>
            <span className="text-[10px] font-mono">{fmt(curPrice)}</span>
            <span className="text-[10px] font-mono text-chart-green">TP2</span>
          </div>
        )}

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