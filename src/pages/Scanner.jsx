import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchTopPairs, fetchPerpetualPairs, fetchKlines, analyzePairsInBatches } from "../components/scanner/binanceApi";
import { analyzePump } from "../components/scanner/pumpEngine";
import ScannerRow from "../components/scanner/ScannerRow";
import TradingViewModal from "../components/scanner/TradingViewModal";
import ScannerSettings from "../components/scanner/ScannerSettings";
import PairDetailPanel from "../components/scanner/PairDetailPanel";
import AlertsPanel from "../components/alerts/AlertsPanel";
import { useFavorites } from "@/hooks/useFavorites";
import { useNotifications } from "@/hooks/useNotifications";
import { useVolumeMonitor } from "@/hooks/useVolumeMonitor";
import { Search, RefreshCw, Loader2, Filter, Download, ArrowUpDown, Settings, Star, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DEFAULT_SETTINGS = {
  timeframe: "1h",
  maxPairs: 100,
  minVolume: 500000,
  marketSource: "perpetuals",
  use_macd_confirmation: true,
  use_bb_squeeze: true,
  use_adx_filter: true,
  use_obv_divergence: true,
  use_volume_accumulation: true,
  use_trend_filter: true,
  use_market_regime: true,
  noise_filter: true,
};

export default function Scanner() {
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    try { return localStorage.getItem("soso_scanner_status") || "all"; } catch { return "all"; }
  });
  const [sortBy, setSortBy] = useState(() => {
    try { return localStorage.getItem("soso_scanner_sortby") || "score"; } catch { return "score"; }
  });
  const [sortDir, setSortDir] = useState(() => {
    try { return localStorage.getItem("soso_scanner_sortdir") || "desc"; } catch { return "desc"; }
  });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [selectedPair, setSelectedPair] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const notifiedRef = useRef(new Set());
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { notifyStrongPump, notifyVolumeSpike, permission } = useNotifications();

  const addAlert = useCallback((type, symbol, message) => {
    const time = new Date().toLocaleTimeString("ro-RO");
    setAlerts(prev => [{ type, symbol, message, time }, ...prev.slice(0, 49)]);
  }, []);

  const handleVolumeSpike = useCallback((symbol, mult) => {
    const key = `vol-${symbol}-${Math.floor(Date.now() / 60000)}`;
    if (notifiedRef.current.has(key)) return;
    notifiedRef.current.add(key);
    notifyVolumeSpike(symbol, mult);
    addAlert("volume", symbol, `Volume Spike x${mult.toFixed(1)} detectat pe favorit! Early Entry posibil.`);
  }, [notifyVolumeSpike, addAlert]);

  useVolumeMonitor(favorites, handleVolumeSpike);

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("soso_scanner_settings");
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_SETTINGS;
  });

  // Persist scanner settings + filters
  useEffect(() => {
    try { localStorage.setItem("soso_scanner_settings", JSON.stringify(settings)); } catch {}
  }, [settings]);

  useEffect(() => {
    try { localStorage.setItem("soso_scanner_status", statusFilter); } catch {}
  }, [statusFilter]);

  useEffect(() => {
    try { localStorage.setItem("soso_scanner_sortby", sortBy); } catch {}
  }, [sortBy]);

  useEffect(() => {
    try { localStorage.setItem("soso_scanner_sortdir", sortDir); } catch {}
  }, [sortDir]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setProgress(0);
    setPairs([]);

    const isPerpetual = settings.marketSource !== "spot";
    const topPairs = isPerpetual
      ? await fetchPerpetualPairs(settings.maxPairs, settings.minVolume)
      : await fetchTopPairs("USDT", settings.maxPairs || 100, settings.minVolume);

    const analyzed = [];

    await analyzePairsInBatches(
      topPairs,
      async (pair) => {
        const klines = await fetchKlines(pair.symbol, settings.timeframe, 100, isPerpetual);
        const analysis = analyzePump(klines, settings);
        const result = { ...pair, analysis };

        // Check for strong pump alerts
        const score = analysis?.totalScore || 0;
        const status = analysis?.pumpStatus;
        const key = `${pair.symbol}-${Math.floor(Date.now() / 300000)}`;
        if ((status === "STRONG" || score >= 75) && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          notifyStrongPump(pair.symbol, score);
          addAlert("pump", pair.symbol, `Strong Pump detectat! Scor ${score}/100 · ${status}`);
        }

        analyzed.push(result);
        setProgress(Math.round((analyzed.length / topPairs.length) * 100));
        setPairs([...analyzed]);
        return result;
      },
      25,  // batch size
      300, // delay ms between batches
    );

    setLastUpdate(new Date());
    setLoading(false);
  }, [settings, notifyStrongPump, addAlert]);

  useEffect(() => {
    loadData();
  }, []);

  const filtered = pairs
    .filter(p => {
      if (showFavoritesOnly && !isFavorite(p.symbol)) return false;
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
            {pairs.length} perechi scanate · {filtered.length} afișate · TF: <span className="text-primary font-mono">{settings.timeframe}</span>
            {lastUpdate && ` · ${lastUpdate.toLocaleTimeString("ro-RO")}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            className={showFavoritesOnly ? "border-chart-gold text-chart-gold" : ""}
            onClick={() => setShowFavoritesOnly(v => !v)}
          >
            <Star className={`w-4 h-4 mr-1 ${showFavoritesOnly ? "fill-chart-gold text-chart-gold" : ""}`} />
            Favorite {favorites.length > 0 && `(${favorites.length})`}
          </Button>
          <Button
            variant="outline" size="sm"
            className={showAlerts ? "border-primary text-primary" : ""}
            onClick={() => setShowAlerts(v => !v)}
          >
            <Bell className="w-4 h-4 mr-1" />
            Alerte {alerts.length > 0 && <span className="ml-1 bg-destructive text-white text-[9px] rounded-full px-1">{alerts.length}</span>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 mr-1" /> Setări
          </Button>
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

      {/* Alerts Panel */}
      {showAlerts && (
        <AlertsPanel
          alerts={alerts}
          onClear={(i) => setAlerts(prev => prev.filter((_, idx) => idx !== i))}
          onClearAll={() => setAlerts([])}
        />
      )}

      {/* Favorites info */}
      {showFavoritesOnly && favorites.length === 0 && (
        <div className="bg-secondary/40 border border-border rounded-lg p-3 text-xs text-muted-foreground text-center">
          Niciun favorit adăugat. Apasă ⭐ pe orice pereche din tabel.
        </div>
      )}

      {/* Progress */}
      {loading && (
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Analizare perechi ({settings.timeframe})...</span>
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
                  onSelect={(sym) => setSelectedSymbol(sym)}
                  onRowClick={(p) => setSelectedPair(p)}
                  isFavorite={isFavorite(pair.symbol)}
                  onToggleFavorite={() => toggleFavorite(pair.symbol)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pair Detail Panel */}
      {selectedPair && (
        <PairDetailPanel
          pair={selectedPair}
          isFavorite={isFavorite(selectedPair.symbol)}
          onToggleFavorite={() => toggleFavorite(selectedPair.symbol)}
          onClose={() => setSelectedPair(null)}
        />
      )}

      {/* TradingView Modal */}
      {selectedSymbol && (
        <TradingViewModal
          symbol={selectedSymbol}
          onClose={() => setSelectedSymbol(null)}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <ScannerSettings
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}