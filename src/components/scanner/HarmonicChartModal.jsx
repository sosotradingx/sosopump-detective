import React, { useEffect, useMemo, useState } from "react";
import { X, ExternalLink, Loader2, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeHarmonics, PIVOT_PRESETS } from "@/lib/harmonicEngine";
import { exchangeName, DEFAULT_EXCHANGE } from "@/lib/exchanges";

const TIMEFRAMES = ["15m", "1h", "4h", "1d"];
const VW = 1000, VH = 560;
const PAD_L = 8, PAD_R = 70, PAD_T = 16, PAD_B = 28;
const PLOT_W = VW - PAD_L - PAD_R;
const PLOT_H = VH - PAD_T - PAD_B;

const fmt = (v) => (v == null || !isFinite(v) ? "—" : v >= 1 ? v.toFixed(4) : v.toPrecision(4));

export default function HarmonicChartModal({ pair, timeframe = "1h", fetchKlinesFn, onClose }) {
  const [tf, setTf] = useState(timeframe);
  const [preset, setPreset] = useState("fast");
  const [klines, setKlines] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patternIdx, setPatternIdx] = useState(0);

  const exchange = pair?.exchange || DEFAULT_EXCHANGE;
  const tvPrefix = exchange === "bybit" ? "BYBIT:" : "BINANCE:";
  const tvSuffix = exchange === "bybit" ? ".P" : "";
  const tvSymbol = `${tvPrefix}${pair?.symbol}${tvSuffix}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setKlines(null);
    (async () => {
      try {
        const data = await fetchKlinesFn(pair.symbol, tf, 150);
        if (alive) setKlines(data || []);
      } catch {
        if (alive) setKlines([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [pair.symbol, tf, fetchKlinesFn]);

  const analysis = useMemo(
    () => (klines && klines.length > 20 ? analyzeHarmonics(klines, preset) : null),
    [klines, preset]
  );
  const patterns = analysis?.patterns || [];
  const activePattern = patterns[patternIdx] || patterns[0] || null;

  // Reset to best pattern when results change.
  useEffect(() => { setPatternIdx(0); }, [pair.symbol, tf, preset, analysis]);

  // Y-domain: candles + trade levels + PRZ.
  const bounds = useMemo(() => {
    if (!klines || !klines.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const k of klines) { if (k.low < lo) lo = k.low; if (k.high > hi) hi = k.high; }
    if (activePattern) {
      const p = activePattern;
      const vals = [p.entry, p.sl, p.tp1, p.tp2, p.tp3, p.przZone.top, p.przZone.bottom, ...Object.values(p.pivots)];
      for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    const pad = (hi - lo) * 0.08 || hi * 0.05;
    return { lo: lo - pad, hi: hi + pad };
  }, [klines, activePattern]);

  const xFor = (i) => PAD_L + (i / Math.max(1, (klines?.length || 1) - 1)) * PLOT_W;
  const yFor = (price) => bounds ? PAD_T + ((bounds.hi - price) / (bounds.hi - bounds.lo || 1)) * PLOT_H : 0;

  const bullish = activePattern?.bullish;
  const lineColor = bullish ? "#26A69A" : "#EF5350";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-6xl mx-4 overflow-hidden"
        style={{ maxHeight: "90vh", height: "90vh" }}
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
              <Button key={t} size="sm" variant={t === tf ? "default" : "outline"} className="h-7 px-2 text-xs"
                onClick={() => setTf(t)}>{t}</Button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground ml-2">Sensibilitate pivots:</span>
          <div className="flex gap-1">
            {Object.keys(PIVOT_PRESETS).map(p => (
              <Button key={p} size="sm" variant={p === preset ? "secondary" : "ghost"} className="h-7 px-2 text-xs capitalize"
                onClick={() => setPreset(p)}>{p}</Button>
            ))}
          </div>
          {patterns.length > 1 && (
            <>
              <span className="text-[10px] text-muted-foreground ml-2">Tipare ({patterns.length}):</span>
              <div className="flex gap-1 flex-wrap">
                {patterns.map((p, i) => (
                  <Button key={i} size="sm" variant={i === (patterns[patternIdx] ? patternIdx : 0) ? "secondary" : "ghost"}
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setPatternIdx(i)}>
                    {p.bullish ? "▲" : "▼"} {p.name} {p.conf}%
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Chart */}
        <div className="flex-1 overflow-auto p-3">
          {loading || !klines || !bounds ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Încărcare klines {pair?.symbol} · {tf}...</p>
            </div>
          ) : klines.length < 20 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Date insuficiente pe {tf} pentru detecție armonică.
            </div>
          ) : (
            <>
              <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ maxHeight: "62vh" }}>
                {/* Grid */}
                {[0, 0.25, 0.5, 0.75, 1].map(g => (
                  <line key={g} x1={PAD_L} x2={PAD_L + PLOT_W}
                    y1={PAD_T + g * PLOT_H} y2={PAD_T + g * PLOT_H}
                    stroke="hsl(222 30% 18%)" strokeDasharray="3 3" />
                ))}
                {/* Price axis ticks (right) */}
                {[0, 0.25, 0.5, 0.75, 1].map(g => {
                  const price = bounds.hi - g * (bounds.hi - bounds.lo);
                  return (
                    <text key={g} x={PAD_L + PLOT_W + 6} y={PAD_T + g * PLOT_H + 3}
                      fill="hsl(215 20% 55%)" fontSize="10" fontFamily="monospace">
                      {fmt(price)}
                    </text>
                  );
                })}

                {/* PRZ zone band (drawn under candles) */}
                {activePattern && (() => {
                  const p = activePattern;
                  const dBar = p.bars.bD ?? (klines.length - 1);
                  const x1 = xFor(dBar);
                  const x2 = PAD_L + PLOT_W;
                  const yTop = yFor(Math.max(p.przZone.top, p.przZone.bottom));
                  const yBot = yFor(Math.min(p.przZone.top, p.przZone.bottom));
                  return (
                    <rect x={x1} y={yTop} width={x2 - x1} height={Math.max(yBot - yTop, 2)}
                      fill="#9C27B0" opacity="0.16" stroke="#9C27B0" strokeOpacity="0.4" strokeDasharray="4 3" />
                  );
                })()}

                {/* Candlesticks */}
                {klines.map((k, i) => {
                  const x = xFor(i);
                  const w = Math.max((PLOT_W / klines.length) * 0.7, 1);
                  const isG = k.close >= k.open;
                  const c = isG ? "#26A69A" : "#EF5350";
                  const yH = yFor(k.high), yL = yFor(k.low);
                  const yO = yFor(k.open), yC = yFor(k.close);
                  const bodyTop = Math.min(yO, yC);
                  const bodyH = Math.max(Math.abs(yC - yO), 1);
                  return (
                    <g key={i}>
                      <line x1={x} x2={x} y1={yH} y2={yL} stroke={c} strokeWidth={1} />
                      <rect x={x - w / 2} y={bodyTop} width={w} height={bodyH} fill={c} />
                    </g>
                  );
                })}

                {/* Trade levels (Entry / SL / TP) */}
                {activePattern && (() => {
                  const p = activePattern;
                  const lines = [
                    { v: p.sl, color: "#EF5350", label: "SL", dash: "5 3" },
                    { v: p.tp1, color: "#26A69A", label: "TP1", dash: "4 3" },
                    { v: p.tp2, color: "#26A69A", label: "TP2", dash: "4 3" },
                    { v: p.tp3, color: "#26A69A", label: "TP3", dash: "4 3", fade: true },
                    { v: p.entry, color: "#FFFFFF", label: "ENTRY", dash: "2 2" },
                  ];
                  return lines.map((l, idx) => {
                    const y = yFor(l.v);
                    if (y < PAD_T - 2 || y > PAD_T + PLOT_H + 2) return null;
                    return (
                      <g key={idx}>
                        <line x1={PAD_L} x2={PAD_L + PLOT_W} y1={y} y2={y}
                          stroke={l.color} strokeWidth={1} strokeDasharray={l.dash} opacity={l.fade ? 0.45 : 0.85} />
                        <text x={PAD_L + PLOT_W + 6} y={y + 3} fill={l.color} fontSize="9" fontFamily="monospace" opacity="0.9">
                          {l.label} {fmt(l.v)}
                        </text>
                      </g>
                    );
                  });
                })()}

                {/* Harmonic pattern geometry X-A-B-C-D */}
                {activePattern && (() => {
                  const p = activePattern;
                  const dBar = p.bars.bD ?? (klines.length - 1 + 2);
                  const pts = [
                    { bar: p.bars.bX, price: p.pivots.X, label: "X" },
                    { bar: p.bars.bA, price: p.pivots.A, label: "A" },
                    { bar: p.bars.bB, price: p.pivots.B, label: "B" },
                    { bar: p.bars.bC, price: p.pivots.C, label: "C" },
                    { bar: dBar, price: p.pivots.D, label: "D" },
                  ];
                  const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${xFor(pt.bar).toFixed(1)} ${yFor(pt.price).toFixed(1)}`).join(" ");
                  return (
                    <g>
                      <path d={path} fill="none" stroke={lineColor} strokeWidth={2} opacity={0.9} />
                      {/* Dashed projection C->D for potential patterns */}
                      {!p.completed && (
                        <path d={`M ${xFor(p.bars.bC).toFixed(1)} ${yFor(p.pivots.C).toFixed(1)} L ${xFor(dBar).toFixed(1)} ${yFor(p.pivots.D).toFixed(1)}`}
                          fill="none" stroke={lineColor} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.6} />
                      )}
                      {pts.map((pt, i) => (
                        <g key={i}>
                          <circle cx={xFor(pt.bar)} cy={yFor(pt.price)} r={3.5} fill={lineColor} stroke="#0b0e14" strokeWidth={1} />
                          <text x={xFor(pt.bar)} y={yFor(pt.price) - 7} fill={lineColor} fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                            {pt.label}
                          </text>
                        </g>
                      ))}
                    </g>
                  );
                })()}
              </svg>

              {/* Pattern info footer */}
              {activePattern && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-3 text-[10px] font-mono">
                  <InfoBox label="PRZ Zonă" value={`${fmt(activePattern.przZone.bottom)} – ${fmt(activePattern.przZone.top)}`} color="text-chart-purple" />
                  <InfoBox label="Entry" value={fmt(activePattern.entry)} color="text-foreground" />
                  <InfoBox label="Stop Loss" value={fmt(activePattern.sl)} color="text-chart-red" />
                  <InfoBox label="TP1 / TP2 / TP3" value={`${fmt(activePattern.tp1)} / ${fmt(activePattern.tp2)} / ${fmt(activePattern.tp3)}`} color="text-chart-green" />
                  <InfoBox label="R:R (TP2)" value={`1:${activePattern.rr.toFixed(2)}`} color="text-chart-gold" />
                  <InfoBox label="Conf / Fit / PRZ" value={`${activePattern.conf}% / ${Math.round(activePattern.fit)}% / ${Math.round(activePattern.prz)}%`} color="text-chart-gold" />
                  <InfoBox label="XAB" value={`${activePattern.ratios.rAB.toFixed(3)} ${activePattern.checks.okAB ? "✔" : "✖"}`} color={activePattern.checks.okAB ? "text-chart-green" : "text-muted-foreground"} />
                  <InfoBox label="ABC" value={`${activePattern.ratios.rBC.toFixed(3)} ${activePattern.checks.okBC ? "✔" : "✖"}`} color={activePattern.checks.okBC ? "text-chart-green" : "text-muted-foreground"} />
                  <InfoBox label="BCD" value={`${activePattern.ratios.rCD.toFixed(3)} ${activePattern.checks.okCD ? "✔" : "✖"}`} color={activePattern.checks.okCD ? "text-chart-green" : "text-muted-foreground"} />
                  <InfoBox label="XAD" value={`${activePattern.ratios.rAD.toFixed(3)} ${activePattern.checks.okAD ? "✔" : "✖"}`} color={activePattern.checks.okAD ? "chart-green" : "text-muted-foreground"} />
                </div>
              )}
            </>
          )}
        </div>
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