import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { fetchTopPairs, fetchKlines } from "../components/scanner/binanceApi";
import { analyzePump } from "../components/scanner/pumpEngine";
import StatsCard from "../components/dashboard/StatsCard";
import TopPumpsTable from "../components/dashboard/TopPumpsTable";
import ScoreBreakdown from "../components/dashboard/ScoreBreakdown";
import MarketRegimeBadge from "../components/dashboard/MarketRegimeBadge";
import { Activity, TrendingUp, Zap, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const navigate = useNavigate();
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [topPair, setTopPair] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const topPairs = await fetchTopPairs("USDT", 30, 1000000);

    // Analyze top 15 pairs with klines
    const analyzed = [];
    const batch = topPairs.slice(0, 15);
    
    // Process in parallel batches of 5
    for (let i = 0; i < batch.length; i += 5) {
      const chunk = batch.slice(i, i + 5);
      const results = await Promise.all(
        chunk.map(async (pair) => {
          const klines = await fetchKlines(pair.symbol, "1h", 100);
          const analysis = analyzePump(klines);
          return { ...pair, analysis };
        })
      );
      analyzed.push(...results);
    }

    // Add remaining pairs without analysis
    const remaining = topPairs.slice(15).map(p => ({ ...p, analysis: null }));
    
    setPairs([...analyzed, ...remaining]);
    
    const best = analyzed.sort((a, b) => (b.analysis?.totalScore || 0) - (a.analysis?.totalScore || 0))[0];
    setTopPair(best);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [loadData]);

  const activePumps = pairs.filter(p => p.analysis?.pumpStatus === "STRONG" || p.analysis?.pumpStatus === "ACTIVE").length;
  const earlyWarnings = pairs.filter(p => p.analysis?.hasEarlyWarning).length;
  const avgScore = pairs.filter(p => p.analysis).length > 0
    ? Math.round(pairs.filter(p => p.analysis).reduce((s, p) => s + (p.analysis?.totalScore || 0), 0) / pairs.filter(p => p.analysis).length)
    : 0;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-primary">🔥</span> Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitorizare în timp real · KuCoin Futures
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground font-mono">
              Actualizat: {lastUpdate.toLocaleTimeString("ro-RO")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Perechi Scanate"
          value={pairs.filter(p => p.analysis).length}
          subtitle="din top 30 volum"
          icon={BarChart3}
          color="text-chart-blue"
        />
        <StatsCard
          title="Pump-uri Active"
          value={activePumps}
          subtitle={activePumps > 0 ? "necesită atenție" : "niciun pump activ"}
          icon={Zap}
          color="text-pump-strong"
        />
        <StatsCard
          title="Early Warnings"
          value={earlyWarnings}
          subtitle="posibile pump-uri"
          icon={Activity}
          color="text-pump-early"
        />
        <StatsCard
          title="Scor Mediu"
          value={avgScore + "%"}
          subtitle="toate perechile"
          icon={TrendingUp}
          color="text-pump-active"
        />
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TopPumpsTable
            data={pairs.filter(p => p.analysis)}
            onSelectPair={(symbol) => navigate(createPageUrl("PairDetail") + `?symbol=${symbol}`)}
          />
        </div>
        <div className="space-y-4">
          {topPair && (
            <>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">🏆 Top Signal</h3>
                  <MarketRegimeBadge regime={topPair.analysis?.marketRegime || "MIXED"} />
                </div>
                <p className="text-xl font-bold font-mono">{topPair.symbol}</p>
                <p className="text-3xl font-bold text-primary mt-1">
                  {topPair.analysis?.totalScore}%
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {topPair.analysis?.volAccum && <span className="text-[10px] bg-chart-blue/20 text-chart-blue px-2 py-0.5 rounded">Vol Accum ✅</span>}
                  {topPair.analysis?.emaCross && <span className="text-[10px] bg-chart-green/20 text-chart-green px-2 py-0.5 rounded">EMA Cross ✅</span>}
                  {topPair.analysis?.macdBullish && <span className="text-[10px] bg-chart-gold/20 text-chart-gold px-2 py-0.5 rounded">MACD ✅</span>}
                  {topPair.analysis?.isSqueeze && <span className="text-[10px] bg-chart-purple/20 text-chart-purple px-2 py-0.5 rounded">BB Squeeze ✅</span>}
                  {topPair.analysis?.adxRising && <span className="text-[10px] bg-pump-active/20 text-pump-active px-2 py-0.5 rounded">ADX Rising ✅</span>}
                  {topPair.analysis?.obvDivergence && <span className="text-[10px] bg-chart-green/20 text-chart-green px-2 py-0.5 rounded">OBV Div ✅</span>}
                </div>
              </div>
              <ScoreBreakdown analysis={topPair.analysis} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}