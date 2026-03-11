import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { fetchTopPairs, fetchKlines } from "../components/scanner/binanceApi";
import { analyzePump } from "../components/scanner/pumpEngine";
import ScannerRow from "../components/scanner/ScannerRow";
import { Search, RefreshCw, Loader2, Filter, Download, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Scanner() {
  const navigate = useNavigate();
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setProgress(0);
    const topPairs = await fetchTopPairs("USDT", 50, 500000);
    
    const analyzed = [];
    const batchSize = 5;
    
    for (let i = 0; i < topPairs.length; i += batchSize) {
      const chunk = topPairs.slice(i, i + batchSize);
      const results = await Promise.all(
        chunk.map(async (pair) => {
          const klines = await fetchKlines(pair.symbol, "1h", 100);
          const analysis = analyzePump(klines);
          return { ...pair, analysis };
        })
      );
      analyzed.push(...results);
      setProgress(Math.round((analyzed.length / topPairs.length) * 100));
      setPairs([...analyzed]);
    }

    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = pairs
    .filter(p => {
      if (search && !p.symbol.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter === "active") return p.analysis?.pumpStatus === "STRONG" || p.analysis?.pumpStatus === "ACTIVE";
      if (statusFilter === "early") return p.analysis?.hasEarlyWarning;
      if (statusFilter === "strong") return p.analysis?.pumpStatus === "STRONG";
      return true;
    })
    .sort((a, b) => {
      let va, vb;
      if (sortBy === "score") { va = a.analysis?.totalScore || 0; vb = b.analysis?.totalScore || 0; }
      else if (sortBy === "change") { va = a.priceChangePercent; vb = b.priceChangePercent; }
      else if (sortBy === "volume") { va = a.quoteVolume; vb = b.quoteVolume; }
      else if (sortBy === "rsi") { va = a.analysis?.rsi || 0; vb = b.analysis?.rsi || 0; }
      else { va = a.analysis?.totalScore || 0; vb = b.analysis?.totalScore || 0; }
      return sortDir === "desc" ? vb - va : va - vb;
    });

  const exportCSV = () => {
    const headers = "Symbol,Price,Change%,Score,Status,Volume,RSI,Market\n";
    const rows = filtered.map(p =>
      `${p.symbol},${p.price},${p.priceChangePercent.toFixed(2)},${p.analysis?.totalScore || 0},${p.analysis?.pumpStatus || "INACTIVE"},${p.quoteVolume.toFixed(0)},${p.analysis?.rsi || 0},${p.analysis?.marketRegime || "MIXED"}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pump-scanner-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🔍 Pump Scanner</h1>
          <p className="text-sm text-muted-foreground">
            {pairs.length} perechi scanate · {filtered.length} afișate
            {lastUpdate && ` · ${lastUpdate.toLocaleTimeString("ro-RO")}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="bg-primary hover:bg-primary/90"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Scanare
          </Button>
        </div>
      </div>

      {/* Progress */}
      {loading && (
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Analizare perechi...</span>
            <span className="text-xs font-mono text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Caută pereche..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-card">
            <Filter className="w-3 h-3 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate</SelectItem>
            <SelectItem value="active">Active 🔥</SelectItem>
            <SelectItem value="early">Early Warning 🔔</SelectItem>
            <SelectItem value="strong">Strong Only 💪</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40 bg-card">
            <ArrowUpDown className="w-3 h-3 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Pump Score</SelectItem>
            <SelectItem value="change">Schimbare 24h</SelectItem>
            <SelectItem value="volume">Volum</SelectItem>
            <SelectItem value="rsi">RSI</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] uppercase text-muted-foreground border-b border-border bg-secondary/30">
                <th className="text-left p-3">Pereche</th>
                <th className="text-right p-3">Preț</th>
                <th className="text-right p-3">24h %</th>
                <th className="text-center p-3">Score</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Vol Spike</th>
                <th className="text-center p-3">RSI</th>
                <th className="text-center p-3">Market</th>
                <th className="text-center p-3">Signals</th>
                <th className="text-right p-3">Volum 24h</th>
                <th className="text-center p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(pair => (
                <ScannerRow
                  key={pair.symbol}
                  pair={pair}
                  onSelect={(sym) => navigate(createPageUrl("PairDetail") + `?symbol=${sym}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}