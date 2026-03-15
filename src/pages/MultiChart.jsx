import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchTopPairs, fetchKlines } from "../components/scanner/binanceApi";
import { analyzePump } from "../components/scanner/pumpEngine";
import ChartPanel from "../components/multichart/ChartPanel";
import CorrelationBar from "../components/multichart/CorrelationBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LayoutGrid, Maximize2, Minimize2, Zap, RefreshCw, Star } from "lucide-react";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
const DEFAULT_TIMEFRAMES = ["1h", "1h", "1h", "1h"];
const GRID_LAYOUTS = [
  { id: "2x2", label: "2×2", cols: "grid-cols-2", rows: 2, panels: 4 },
  { id: "1+3", label: "1+3", cols: "grid-cols-3", rows: 2, panels: 4, custom: true },
  { id: "1x2", label: "1×2", cols: "grid-cols-2", rows: 1, panels: 2 },
  { id: "1x1", label: "1×1", cols: "grid-cols-1", rows: 1, panels: 1 },
];

export default function MultiChart() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [timeframes, setTimeframes] = useState(DEFAULT_TIMEFRAMES);
  const [availablePairs, setAvailablePairs] = useState([]);
  const [klinesMap, setKlinesMap] = useState({});
  const [topPumpPairs, setTopPumpPairs] = useState([]);
  const [layout, setLayout] = useState(GRID_LAYOUTS[0]);
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [syncTimeframe, setSyncTimeframe] = useState(null);
  const [autoFill, setAutoFill] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const intervalRef = useRef(null);

  // Load available pairs + detect top pumps
  useEffect(() => {
    (async () => {
      setLoadingPairs(true);
      const pairs = await fetchTopPairs("USDT", 60, 500000);
      setAvailablePairs(pairs.map(p => p.symbol));

      // Quick score scan on top 20
      const analyzed = await Promise.all(
        pairs.slice(0, 20).map(async p => {
          const kl = await fetchKlines(p.symbol, "1h", 60);
          const a = analyzePump(kl);
          return { symbol: p.symbol, score: a.totalScore, status: a.pumpStatus };
        })
      );
      const sorted = analyzed.sort((a, b) => b.score - a.score);
      setTopPumpPairs(sorted.slice(0, 8));
      setLoadingPairs(false);
    })();
  }, []);

  // Collect klines for correlation
  const collectKlines = useCallback(async () => {
    const unique = [...new Set(symbols.filter(Boolean))];
    const results = {};
    await Promise.all(unique.map(async sym => {
      const kl = await fetchKlines(sym, "1h", 60);
      results[sym] = kl;
    }));
    setKlinesMap(prev => ({ ...prev, ...results }));
  }, [symbols]);

  useEffect(() => {
    collectKlines();
  }, [collectKlines]);

  // Auto-refresh klines map every 60s
  useEffect(() => {
    intervalRef.current = setInterval(collectKlines, 60000);
    return () => clearInterval(intervalRef.current);
  }, [collectKlines]);

  // Auto-fill top pump pairs
  const handleAutoFill = async () => {
    if (topPumpPairs.length === 0) return;
    setAutoFillLoading(true);
    const n = layout.panels;
    const newSymbols = topPumpPairs.slice(0, n).map(p => p.symbol);
    while (newSymbols.length < 4) newSymbols.push(newSymbols[newSymbols.length - 1] || "BTCUSDT");
    setSymbols(newSymbols);
    setAutoFillLoading(false);
  };

  // Sync all timeframes
  const handleSyncTF = (tf) => {
    setSyncTimeframe(tf);
    setTimeframes(Array(4).fill(tf));
  };

  const handleSymbolChange = (i, sym) => {
    setSymbols(prev => { const n = [...prev]; n[i] = sym; return n; });
  };

  const handleTFChange = (i, tf) => {
    setSyncTimeframe(null);
    setTimeframes(prev => { const n = [...prev]; n[i] = tf; return n; });
  };

  const visiblePanels = Array.from({ length: layout.panels });

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 mr-2">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-bold">Multi-Chart</h1>
        </div>

        {/* Layout selector */}
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          {GRID_LAYOUTS.map(l => (
            <button
              key={l.id}
              onClick={() => setLayout(l)}
              className={`text-[10px] font-mono px-2.5 py-1 rounded transition-all ${
                layout.id === l.id
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Sync TF */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">Sync TF:</span>
          <div className="flex gap-0.5">
            {["15m", "1h", "4h", "1d"].map(tf => (
              <button
                key={tf}
                onClick={() => syncTimeframe === tf ? setSyncTimeframe(null) : handleSyncTF(tf)}
                className={`text-[10px] font-mono px-2 py-1 rounded transition-all ${
                  syncTimeframe === tf
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground bg-secondary"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-fill top pumps */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] border-pump-active/40 text-pump-active hover:bg-pump-active/10"
          onClick={handleAutoFill}
          disabled={autoFillLoading || loadingPairs}
        >
          {autoFillLoading
            ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
            : <Zap className="w-3 h-3 mr-1" />
          }
          Top Pumps
        </Button>

        {/* Top pump badges */}
        {!loadingPairs && topPumpPairs.length > 0 && (
          <div className="flex items-center gap-1 ml-1 flex-wrap">
            {topPumpPairs.slice(0, 6).map(p => (
              <button
                key={p.symbol}
                onClick={() => {
                  const next = symbols.includes(p.symbol)
                    ? symbols
                    : symbols.map((s, i) => i === symbols.indexOf(symbols.find(x => !topPumpPairs.map(t => t.symbol).includes(x)) || symbols[symbols.length - 1]) ? p.symbol : s);
                  setSymbols(next);
                }}
                title={`Score: ${p.score} · ${p.status}`}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-all hover:scale-105 ${
                  p.score >= 70 ? "bg-pump-strong/20 text-pump-strong border-pump-strong/30" :
                  p.score >= 40 ? "bg-pump-active/20 text-pump-active border-pump-active/30" :
                  "bg-secondary text-muted-foreground border-border"
                } ${symbols.includes(p.symbol) ? "ring-1 ring-primary" : ""}`}
              >
                {p.symbol.replace("USDT", "")} {p.score}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={collectKlines} title="Refresh corelații">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Correlation bar */}
      <div className="shrink-0 px-3 py-2 border-b border-border/50">
        <CorrelationBar klinesMap={klinesMap} symbols={symbols.filter(Boolean)} />
      </div>

      {/* Chart Grid */}
      <div className="flex-1 min-h-0 p-2 overflow-auto">
        {layout.id === "1+3" ? (
          // Special 1+3 layout
          <div className="grid grid-cols-3 gap-2 h-full" style={{ minHeight: 0 }}>
            <div className="col-span-2 row-span-2" style={{ minHeight: 0 }}>
              <ChartPanel
                index={0}
                symbol={symbols[0]}
                timeframe={timeframes[0]}
                onSymbolChange={s => handleSymbolChange(0, s)}
                onTimeframeChange={tf => handleTFChange(0, tf)}
                availablePairs={availablePairs}
                colorIndex={0}
                isExpanded
              />
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ minHeight: 0 }}>
                <ChartPanel
                  index={i}
                  symbol={symbols[i]}
                  timeframe={timeframes[i]}
                  onSymbolChange={s => handleSymbolChange(i, s)}
                  onTimeframeChange={tf => handleTFChange(i, tf)}
                  availablePairs={availablePairs}
                  colorIndex={i}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid ${layout.cols} gap-2 h-full`} style={{ minHeight: 0 }}>
            {visiblePanels.map((_, i) => (
              <div key={i} style={{ minHeight: 0 }}>
                <ChartPanel
                  index={i}
                  symbol={symbols[i]}
                  timeframe={timeframes[i]}
                  onSymbolChange={s => handleSymbolChange(i, s)}
                  onTimeframeChange={tf => handleTFChange(i, tf)}
                  availablePairs={availablePairs}
                  colorIndex={i}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}