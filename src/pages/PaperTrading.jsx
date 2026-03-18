import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTopPairs, fetchPerpetualPairs, fetchKlines, formatPrice, formatVolume } from "../components/scanner/binanceApi";
import { analyzePump } from "../components/scanner/pumpEngine";
import AutoTradeSettings from "../components/papertrading/AutoTradeSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, X, Bot, Settings, Loader2, Zap, Activity } from "lucide-react";

const DEFAULT_AUTO_CONFIG = {
  minScore: 70,
  tradeSize: 200,
  maxOpenTrades: 5,
  stopLossPct: 5,
  takeProfitPct: 30,
  timeframe: "1h",
  autoTP: true,
  autoSL: true,
  autoExitLowScore: true,
  cooldownMinutes: 60,
  marketSource: "perpetuals",
  scanPairs: 100,
};

function loadAutoConfig() {
  try {
    const saved = localStorage.getItem("soso_auto_config");
    if (saved) return { ...DEFAULT_AUTO_CONFIG, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_AUTO_CONFIG;
}

function saveAutoConfig(cfg) {
  try { localStorage.setItem("soso_auto_config", JSON.stringify(cfg)); } catch {}
}

export default function PaperTrading() {
  const queryClient = useQueryClient();
  const [prices, setPrices] = useState({});
  const [openDialog, setOpenDialog] = useState(false);
  const [newTrade, setNewTrade] = useState({ symbol: "BTCUSDT", quantity: 0.01, stop_loss: 0, take_profit: 0 });
  const [autoEnabled, setAutoEnabled] = useState(() => {
    try { return localStorage.getItem("soso_auto_enabled") === "true"; } catch { return false; }
  });
  const [autoConfig, setAutoConfig] = useState(loadAutoConfig);
  const [showAutoSettings, setShowAutoSettings] = useState(false);
  // cooldownMap: { [symbol]: timestamp when cooldown expires }
  const cooldownMap = useRef({});

  // Persist config & enabled state
  useEffect(() => { saveAutoConfig(autoConfig); }, [autoConfig]);
  useEffect(() => { try { localStorage.setItem("soso_auto_enabled", String(autoEnabled)); } catch {} }, [autoEnabled]);
  const [botLog, setBotLog] = useState([]);
  const [botRunning, setBotRunning] = useState(false);
  const botRunningRef = useRef(false);
  const autoConfigRef = useRef(autoConfig);
  const autoIntervalRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => { autoConfigRef.current = autoConfig; }, [autoConfig]);

  const { data: trades = [], isLoading } = useQuery({
    queryKey: ["paper-trades"],
    queryFn: () => base44.entities.PaperTrade.list("-created_date", 100),
  });

  const createTrade = useMutation({
    mutationFn: (data) => base44.entities.PaperTrade.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["paper-trades"] }); setOpenDialog(false); },
  });

  const closeTrade = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PaperTrade.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paper-trades"] }),
  });

  const loadPrices = useCallback(async () => {
    const pairs = await fetchTopPairs("USDT", 50, 100000);
    const priceMap = {};
    pairs.forEach(p => { priceMap[p.symbol] = p.price; });
    setPrices(priceMap);
    return pairs;
  }, []);

  useEffect(() => {
    loadPrices();
    const interval = setInterval(loadPrices, 15000);
    return () => clearInterval(interval);
  }, [loadPrices]);

  // --- Auto-trading logic ---
  const runAutoBot = useCallback(async () => {
    if (botRunningRef.current) return;
    botRunningRef.current = true;
    setBotRunning(true);

    const cfg = autoConfigRef.current;
    const currentTrades = await base44.entities.PaperTrade.list("-created_date", 100);
    const openTrades = currentTrades.filter(t => t.status === "open");
    const isPerpetual = cfg.marketSource !== "spot";
    const pairs = isPerpetual
      ? await fetchPerpetualPairs(cfg.scanPairs ?? 100, 500000)
      : await fetchTopPairs("USDT", cfg.scanPairs ?? 100, 500000);
    const priceMap = {};
    pairs.forEach(p => { priceMap[p.symbol] = p.price; });
    setPrices(priceMap);

    const log = (msg) => setBotLog(prev => [`[${new Date().toLocaleTimeString("ro-RO")}] ${msg}`, ...prev.slice(0, 29)]);

    // --- Check open trades for exit conditions ---
    for (const trade of openTrades) {
      const cur = priceMap[trade.symbol] || trade.entry_price;
      const pnlPct = ((cur - trade.entry_price) / trade.entry_price) * 100;
      let reason = null;

      if (cfg.autoTP && trade.take_profit > 0 && cur >= trade.take_profit) reason = "take_profit";
      else if (cfg.autoSL && trade.stop_loss > 0 && cur <= trade.stop_loss) reason = "stop_loss";

      if (!reason && cfg.autoExitLowScore) {
        const kl = await fetchKlines(trade.symbol, cfg.timeframe, 60, isPerpetual);
        const analysis = analyzePump(kl);
        if (analysis.totalScore < 20) reason = "adx_exhaustion";
      }

      if (reason) {
        const pnlUsd = (cur - trade.entry_price) * trade.quantity;
        await base44.entities.PaperTrade.update(trade.id, {
          status: "closed",
          exit_price: cur,
          pnl_percent: Math.round(pnlPct * 100) / 100,
          pnl_usd: Math.round(pnlUsd * 100) / 100,
          exit_reason: reason,
        });
        const cooldownMs = (cfg.cooldownMinutes || 60) * 60 * 1000;
        cooldownMap.current[trade.symbol] = Date.now() + cooldownMs;
        log(`❌ ÎNCHIS ${trade.symbol} | ${reason} | P&L: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% | Cooldown: ${cfg.cooldownMinutes}min`);
      }
    }

    // --- Open new trades ---
    const freshOpen = (await base44.entities.PaperTrade.list("-created_date", 100)).filter(t => t.status === "open");
    const openSymbols = new Set(freshOpen.map(t => t.symbol));

    if (freshOpen.length >= cfg.maxOpenTrades) {
      log(`⏸ Max poziții atinse (${cfg.maxOpenTrades})`);
      botRunningRef.current = false;
      setBotRunning(false);
      queryClient.invalidateQueries({ queryKey: ["paper-trades"] });
      return;
    }

    const now = Date.now();
    const candidates = pairs
      .filter(p => !openSymbols.has(p.symbol))
      .filter(p => !(cooldownMap.current[p.symbol] > now))
      .slice(0, 30);

    let opened = 0;
    for (const pair of candidates) {
      if (freshOpen.length + opened >= cfg.maxOpenTrades) break;
      if (openSymbols.has(pair.symbol)) continue;

      const kl = await fetchKlines(pair.symbol, cfg.timeframe, 80, isPerpetual);
      const analysis = analyzePump(kl, {
        use_macd_confirmation: cfg.useMacd ?? true,
        use_bb_squeeze: cfg.useBbSqueeze ?? true,
        use_adx_filter: cfg.useAdx ?? true,
        use_obv_divergence: cfg.useObv ?? true,
        use_trend_filter: cfg.useTrendFilter ?? true,
        use_volume_accumulation: cfg.useVolAccum ?? true,
        adx_threshold: cfg.adxThreshold ?? 20,
        exhaustion_rsi: cfg.exhaustionRsi ?? 75,
        volume_multiplier: cfg.volumeMultiplier ?? 2.5,
        noise_filter: cfg.noiseFilter ?? true,
      });

      if (analysis.totalScore >= cfg.minScore) {
        const price = priceMap[pair.symbol] || pair.price;
        const precisionFactor = price < 0.001 ? 1e10 : price < 0.01 ? 1e8 : price < 1 ? 1e6 : 1e4;
        const quantity = Math.floor((cfg.tradeSize / price) * 1000) / 1000;
        const stopLoss = Math.round(price * (1 - cfg.stopLossPct / 100) * precisionFactor) / precisionFactor;
        const takeProfit = Math.round(price * (1 + cfg.takeProfitPct / 100) * precisionFactor) / precisionFactor;

        await base44.entities.PaperTrade.create({
          symbol: pair.symbol,
          side: "BUY",
          status: "open",
          entry_price: price,
          quantity,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          pump_score_at_entry: analysis.totalScore,
          notes: `Auto | TF:${cfg.timeframe} | Score:${analysis.totalScore} | ${analysis.pumpStatus}`,
        });
        openSymbols.add(pair.symbol);
        log(`✅ DESCHIS ${pair.symbol} | Score: ${analysis.totalScore} | SL:${stopLoss} TP:${takeProfit}`);
        opened++;
      }
    }

    if (opened === 0) log("🔍 Scan complet, niciun semnal nou găsit.");
    queryClient.invalidateQueries({ queryKey: ["paper-trades"] });
    botRunningRef.current = false;
    setBotRunning(false);
  }, [queryClient]);

  // Convert timeframe string to milliseconds
  const tfToMs = (tf) => {
    const map = { "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };
    return map[tf] || 60000;
  };

  // Stable ref to runAutoBot so interval doesn't need to re-register
  const runAutoBotRef = useRef(runAutoBot);
  useEffect(() => { runAutoBotRef.current = runAutoBot; }, [runAutoBot]);

  // Start/stop auto bot interval — only re-runs when autoEnabled changes
  useEffect(() => {
    if (!autoEnabled) {
      clearInterval(autoIntervalRef.current);
      return;
    }
    // Run immediately, then schedule based on current timeframe
    runAutoBotRef.current();
    const scheduleNext = () => {
      const intervalMs = tfToMs(autoConfigRef.current.timeframe);
      autoIntervalRef.current = setTimeout(() => {
        runAutoBotRef.current();
        scheduleNext();
      }, intervalMs);
    };
    scheduleNext();
    return () => clearTimeout(autoIntervalRef.current);
  }, [autoEnabled]);

  const openTrades = trades.filter(t => t.status === "open");
  const closedTrades = trades.filter(t => t.status === "closed");

  const handleOpenTrade = () => {
    const price = prices[newTrade.symbol] || 0;
    createTrade.mutate({
      ...newTrade,
      entry_price: price,
      status: "open",
      stop_loss: newTrade.stop_loss || price * 0.95,
      take_profit: newTrade.take_profit || price * 1.3,
    });
  };

  const handleCloseTrade = (trade) => {
    const currentPrice = prices[trade.symbol] || trade.entry_price;
    const pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
    const pnlUsd = (currentPrice - trade.entry_price) * trade.quantity;
    closeTrade.mutate({
      id: trade.id,
      data: {
        status: "closed",
        exit_price: currentPrice,
        pnl_percent: Math.round(pnlPercent * 100) / 100,
        pnl_usd: Math.round(pnlUsd * 100) / 100,
        exit_reason: "manual",
      },
    });
  };

  const initialBalance = 10000;
  const totalPnL = closedTrades.reduce((s, t) => s + (t.pnl_usd || 0), 0);
  const unrealizedPnL = openTrades.reduce((s, t) => {
    const cur = prices[t.symbol] || t.entry_price;
    return s + (cur - t.entry_price) * t.quantity;
  }, 0);
  const currentBalance = initialBalance + totalPnL + unrealizedPnL;
  const winRate = closedTrades.length > 0
    ? Math.round((closedTrades.filter(t => (t.pnl_usd || 0) > 0).length / closedTrades.length) * 100)
    : 0;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">💰 Paper Trading</h1>
          <p className="text-sm text-muted-foreground">Portofoliu virtual · Pump Strategy</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto Bot Toggle */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${autoEnabled ? "bg-pump-strong/10 border-pump-strong/40" : "bg-secondary border-border"}`}>
            <Bot className={`w-4 h-4 ${autoEnabled ? "text-pump-strong" : "text-muted-foreground"}`} />
            <span className="text-xs font-mono">Auto-Bot</span>
            <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} />
            {botRunning && <Loader2 className="w-3 h-3 animate-spin text-pump-strong" />}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAutoSettings(true)}>
            <Settings className="w-4 h-4 mr-1" /> Bot Setări
          </Button>
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" /> Deschide Poziție
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Poziție Nouă</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Pereche</Label>
                  <Select value={newTrade.symbol} onValueChange={v => setNewTrade({ ...newTrade, symbol: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(prices).slice(0, 30).map(s => (
                        <SelectItem key={s} value={s}>{s} - ${formatPrice(prices[s])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cantitate</Label>
                  <Input type="number" step="0.001" value={newTrade.quantity}
                    onChange={e => setNewTrade({ ...newTrade, quantity: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Stop Loss ($)</Label>
                    <Input type="number" step="0.01" value={newTrade.stop_loss}
                      onChange={e => setNewTrade({ ...newTrade, stop_loss: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>Take Profit ($)</Label>
                    <Input type="number" step="0.01" value={newTrade.take_profit}
                      onChange={e => setNewTrade({ ...newTrade, take_profit: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-sm">
                  <p>Preț curent: <span className="font-mono font-bold">${formatPrice(prices[newTrade.symbol] || 0)}</span></p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Valoare: ${((prices[newTrade.symbol] || 0) * newTrade.quantity).toFixed(2)}
                  </p>
                </div>
                <Button onClick={handleOpenTrade} disabled={createTrade.isPending} className="w-full bg-pump-strong hover:bg-pump-strong/90">
                  {createTrade.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Deschide BUY
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bot Status Bar */}
      {autoEnabled && (
        <div className="bg-pump-strong/10 border border-pump-strong/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-pump-strong" />
            <span className="text-xs font-mono font-semibold text-pump-strong">BOT ACTIV</span>
            <span className="text-xs text-muted-foreground">· TF: <span className="text-primary font-mono">{autoConfig.timeframe}</span> · Scan la fiecare <span className="text-primary font-mono">{autoConfig.timeframe}</span> · Scor minim: {autoConfig.minScore} · Max: {autoConfig.maxOpenTrades} · SL: {autoConfig.stopLossPct}% · TP: {autoConfig.takeProfitPct}%</span>
          </div>
          {botLog.length > 0 && (
            <div className="bg-background/50 rounded-lg p-2 max-h-24 overflow-y-auto space-y-0.5">
              {botLog.map((line, i) => (
                <p key={i} className="text-[10px] font-mono text-muted-foreground">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">BALANȚĂ</p>
          <p className="text-2xl font-bold mt-1">${currentBalance.toFixed(2)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">P&L TOTAL</p>
          <p className={`text-2xl font-bold mt-1 ${totalPnL >= 0 ? "text-chart-green" : "text-chart-red"}`}>
            {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">NEREALIZAT</p>
          <p className={`text-2xl font-bold mt-1 ${unrealizedPnL >= 0 ? "text-chart-green" : "text-chart-red"}`}>
            {unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toFixed(2)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">WIN RATE</p>
          <p className={`text-2xl font-bold mt-1 ${winRate >= 50 ? "text-chart-green" : "text-chart-red"}`}>
            {winRate}%
          </p>
        </div>
      </div>

      {/* Open Positions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">📊 Poziții Deschise ({openTrades.length})</h3>
        </div>
        {openTrades.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nicio poziție deschisă. {autoEnabled ? "Botul scanează semnale..." : "Activează Auto-Bot sau deschide manual."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-3">Pereche</th>
                  <th className="text-left p-3">Deschis</th>
                  <th className="text-center p-3">TF</th>
                  <th className="text-right p-3">Intrare</th>
                  <th className="text-right p-3">Curent</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="text-right p-3">SL / TP</th>
                  <th className="text-center p-3">Tip</th>
                  <th className="text-center p-3">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map(trade => {
                  const curPrice = prices[trade.symbol] || trade.entry_price;
                  const pnl = ((curPrice - trade.entry_price) / trade.entry_price) * 100;
                  const pnlUsd = (curPrice - trade.entry_price) * trade.quantity;
                  const isAuto = trade.notes?.startsWith("Auto");
                  const tfMatch = trade.notes?.match(/TF:(\S+)/);
                  const tf = tfMatch ? tfMatch[1] : (isAuto ? autoConfig.timeframe : "—");
                  const openTime = trade.created_date ? new Date(trade.created_date).toLocaleString("ro-RO", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—";
                  return (
                    <tr key={trade.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="p-3 font-mono font-semibold">
                        {trade.symbol}
                        {isAuto && <span className="ml-1 text-[9px] text-primary bg-primary/10 px-1 py-0.5 rounded">BOT</span>}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground font-mono">{openTime}</td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{tf}</span>
                      </td>
                      <td className="p-3 text-right font-mono">${formatPrice(trade.entry_price)}</td>
                      <td className="p-3 text-right font-mono">${formatPrice(curPrice)}</td>
                      <td className={`p-3 text-right font-mono font-bold ${pnl >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                        <br />
                        <span className="text-xs">${pnlUsd.toFixed(2)}</span>
                      </td>
                      <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                        <span className="text-chart-red">${formatPrice(trade.stop_loss)}</span>
                        {" / "}
                        <span className="text-chart-green">${formatPrice(trade.take_profit)}</span>
                      </td>
                      <td className="p-3 text-center">
                        {isAuto
                          ? <Badge className="bg-primary/10 text-primary text-[10px]"><Bot className="w-2.5 h-2.5 mr-1" />Auto</Badge>
                          : <Badge variant="outline" className="text-[10px]">Manual</Badge>
                        }
                      </td>
                      <td className="p-3 text-center">
                        <Button variant="destructive" size="sm" onClick={() => handleCloseTrade(trade)}>
                          <X className="w-3 h-3 mr-1" /> Închide
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Closed Trades */}
      {closedTrades.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold">📜 Istoric ({closedTrades.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-3">Pereche</th>
                  <th className="text-left p-3">Deschis</th>
                  <th className="text-left p-3">Închis</th>
                  <th className="text-center p-3">TF</th>
                  <th className="text-right p-3">Intrare</th>
                  <th className="text-right p-3">Ieșire</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="text-center p-3">Motiv</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.slice(0, 50).map(trade => {
                  const tfMatch = trade.notes?.match(/TF:(\S+)/);
                  const tf = tfMatch ? tfMatch[1] : "—";
                  const openTime = trade.created_date ? new Date(trade.created_date).toLocaleString("ro-RO", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—";
                  const closeTime = trade.updated_date ? new Date(trade.updated_date).toLocaleString("ro-RO", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—";
                  return (
                  <tr key={trade.id} className="border-b border-border/50">
                    <td className="p-3 font-mono text-xs font-semibold">{trade.symbol}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{openTime}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{closeTime}</td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{tf}</span>
                    </td>
                    <td className="p-3 text-right font-mono text-xs">${formatPrice(trade.entry_price)}</td>
                    <td className="p-3 text-right font-mono text-xs">${formatPrice(trade.exit_price)}</td>
                    <td className={`p-3 text-right font-mono font-bold text-xs ${(trade.pnl_percent || 0) >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                      {(trade.pnl_percent || 0) >= 0 ? "+" : ""}{(trade.pnl_percent || 0).toFixed(2)}%
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className="text-[10px]">{trade.exit_reason || "manual"}</Badge>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Auto Settings Panel */}
      {showAutoSettings && (
        <AutoTradeSettings
          config={autoConfig}
          onChange={setAutoConfig}
          onClose={() => setShowAutoSettings(false)}
        />
      )}
    </div>
  );
}