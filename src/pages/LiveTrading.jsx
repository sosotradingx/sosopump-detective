import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchPerpetualPairs, fetchTopPairs, fetchKlines, formatPrice } from "../components/scanner/binanceApi";
import { analyzePump } from "../components/scanner/pumpEngine";
import AutoTradeSettings from "../components/papertrading/AutoTradeSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Zap, RefreshCw, AlertTriangle, Bot, Settings, Activity } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import PlanGate from "@/components/PlanGate";

// --- Helpers ---
const stepSizeCache = {};
async function getStepSize(symbol) {
  if (stepSizeCache[symbol]) return stepSizeCache[symbol];
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo`);
    const data = await res.json();
    const sym = data.symbols?.find(s => s.symbol === symbol);
    const lotFilter = sym?.filters?.find(f => f.filterType === "LOT_SIZE");
    const step = parseFloat(lotFilter?.stepSize || "0.001");
    stepSizeCache[symbol] = step;
    return step;
  } catch {
    return 0.001;
  }
}

function floorToStep(qty, step) {
  if (!step || step === 0) return qty;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  return parseFloat((Math.floor(qty / step) * step).toFixed(precision));
}

// --- Binance API calls via backend ---
async function binanceRequest(keyId, action, params = {}) {
  const res = await base44.functions.invoke('binanceApi', { keyId, action, params });
  if (!res.data?.success) throw new Error(res.data?.error || 'Binance request failed');
  return res.data.data;
}

async function placeBinanceOrderWithSlTp(keyId, symbol, side, quantity, stopLoss, takeProfit, hedgeMode) {
  const res = await base44.functions.invoke('binanceApi', {
    keyId,
    action: 'placeOrderWithSlTp',
    params: { symbol, side, quantity, stopLoss, takeProfit, hedgeMode, positionSide: side === 'BUY' ? 'LONG' : 'SHORT' }
  });
  if (!res.data?.success) throw new Error(res.data?.error || 'Order failed');
  return res.data.data;
}

async function closeBinancePosition(keyId, symbol, positionAmt, hedgeMode) {
  const qty = Math.abs(parseFloat(positionAmt));
  const side = parseFloat(positionAmt) > 0 ? "SELL" : "BUY";
  const params = { symbol, side, type: "MARKET", quantity: qty.toString() };
  if (hedgeMode) {
    params.positionSide = parseFloat(positionAmt) > 0 ? "LONG" : "SHORT";
  } else {
    params.reduceOnly = "true";
  }
  return binanceRequest(keyId, 'placeOrder', params);
}

async function cancelAllBinanceOrders(keyId, symbol) {
  try {
    await binanceRequest(keyId, 'cancelAllOrders', { symbol });
  } catch (e) { console.warn('cancelAllOrders:', e.message); }
}

const DEFAULT_AUTO_CONFIG = {
  minScore: 70,
  tradeSize: 50,
  maxOpenTrades: 3,
  stopLossPct: 5,
  takeProfitPct: 30,
  timeframe: "1h",
  autoTP: true,
  autoSL: true,
  autoExitLowScore: false,
  cooldownMinutes: 60,
  marketSource: "perpetuals",
  scanPairs: 50,
  usePartialTP: false,
  partialTPTarget: 10,
  partialTPPercent: 50,
  moveSlToBreakeven: true,
};

function loadAutoConfig() {
  try {
    const saved = localStorage.getItem("soso_live_auto_config_binance");
    if (saved) return { ...DEFAULT_AUTO_CONFIG, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_AUTO_CONFIG;
}

function saveAutoConfig(cfg) {
  try { localStorage.setItem("soso_live_auto_config_binance", JSON.stringify(cfg)); } catch {}
}

export default function LiveTrading() {
  const { isPro, loading: subLoading } = useSubscription();
  const [user, setUser] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [positions, setPositions] = useState([]);
  const [orderDialog, setOrderDialog] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderParams, setOrderParams] = useState({ symbol: "BTCUSDT", side: "BUY", quantity: 0.001, stopLoss: 0, takeProfit: 0 });
  const [hedgeMode, setHedgeMode] = useState(false);

  const [autoEnabled, setAutoEnabled] = useState(() => {
    try { return localStorage.getItem("soso_live_auto_enabled_binance") === "true"; } catch { return false; }
  });
  const [autoConfig, setAutoConfig] = useState(loadAutoConfig);
  const [showAutoSettings, setShowAutoSettings] = useState(false);
  const [botLog, setBotLog] = useState([]);
  const [botRunning, setBotRunning] = useState(false);

  const botRunningRef = useRef(false);
  const autoConfigRef = useRef(autoConfig);
  const autoIntervalRef = useRef(null);
  const cooldownMap = useRef({});
  const hedgeModeRef = useRef(false);

  useEffect(() => { autoConfigRef.current = autoConfig; }, [autoConfig]);
  useEffect(() => { hedgeModeRef.current = hedgeMode; }, [hedgeMode]);
  useEffect(() => { saveAutoConfig(autoConfig); }, [autoConfig]);
  useEffect(() => {
    try { localStorage.setItem("soso_live_auto_enabled_binance", String(autoEnabled)); } catch {}
  }, [autoEnabled]);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["userApiKeys", user?.email],
    queryFn: () => base44.entities.UserApiKey.filter({ created_by: user.email }, "-created_date", 10),
    enabled: !!user,
  });

  // Only use Binance keys
  const binanceKeys = apiKeys.filter(k => !k.label?.toLowerCase().includes('kucoin'));

  useEffect(() => {
    if (binanceKeys.length > 0 && !activeKey) {
      const active = binanceKeys.find(k => k.is_active) || binanceKeys[0];
      setActiveKey(active);
    }
  }, [binanceKeys.length]);

  useEffect(() => {
    if (!activeKey?.id) return;
    // Check hedge mode
    binanceRequest(activeKey.id, 'getPositionSideDual', {})
      .then(data => {
        const hm = data?.dualSidePosition === true;
        setHedgeMode(hm);
        hedgeModeRef.current = hm;
        addLog(`ℹ️ Conectat la Binance Futures · Hedge Mode: ${hm ? "ON" : "OFF"}`);
      })
      .catch(() => {
        addLog(`ℹ️ Conectat la Binance Futures`);
      });
  }, [activeKey?.id]);

  const addLog = (msg) => setBotLog(prev => [`[${new Date().toLocaleTimeString("ro-RO")}] ${msg}`, ...prev.slice(0, 49)]);

  const fetchBalance = useCallback(async () => {
    if (!activeKey?.id) return;
    setLoadingBalance(true);
    try {
      const data = await binanceRequest(activeKey.id, 'getBalance', {});
      const usdt = Array.isArray(data) ? data.find(b => b.asset === 'USDT') : null;
      if (usdt) {
        setBalance({
          availableBalance: parseFloat(usdt.availableBalance || 0),
          totalWallet: parseFloat(usdt.balance || 0),
          asset: 'USDT'
        });
      }
    } catch (e) { addLog(`❌ Balanță: ${e.message}`); }
    setLoadingBalance(false);
  }, [activeKey]);

  const fetchPositions = useCallback(async () => {
    if (!activeKey?.id) return;
    try {
      const data = await binanceRequest(activeKey.id, 'getPositionRisk', {});
      const open = Array.isArray(data) ? data.filter(p => parseFloat(p.positionAmt) !== 0) : [];
      setPositions(open);
    } catch (e) { console.error("Positions error:", e.message); }
  }, [activeKey]);

  useEffect(() => {
    if (!activeKey) return;
    fetchBalance();
    fetchPositions();
    const interval = setInterval(() => { fetchBalance(); fetchPositions(); }, 15000);
    return () => clearInterval(interval);
  }, [activeKey, fetchBalance, fetchPositions]);

  // --- Auto-bot ---
  const runAutoBot = useCallback(async () => {
    if (botRunningRef.current) return;
    if (!activeKey?.id) { addLog("⚠️ Bot: lipsă cheie API"); return; }

    botRunningRef.current = true;
    setBotRunning(true);

    const cfg = autoConfigRef.current;
    const hm = hedgeModeRef.current;
    const keyId = activeKey.id;
    const isPerpetual = cfg.marketSource !== "spot";

    let livePositions = [];
    try {
      const data = await binanceRequest(keyId, 'getPositionRisk', {});
      livePositions = Array.isArray(data) ? data.filter(p => parseFloat(p.positionAmt) !== 0) : [];
      setPositions(livePositions);
    } catch (e) {
      addLog(`❌ Poziții: ${e.message}`);
      botRunningRef.current = false;
      setBotRunning(false);
      return;
    }

    // Check exit conditions
    if (cfg.autoExitLowScore) {
      for (const pos of livePositions) {
        const kl = await fetchKlines(pos.symbol, cfg.timeframe, 60, isPerpetual).catch(() => []);
        if (kl.length > 0) {
          const analysis = analyzePump(kl);
          if (analysis.totalScore < 20) {
            try {
              await cancelAllBinanceOrders(keyId, pos.symbol);
              await closeBinancePosition(keyId, pos.symbol, pos.positionAmt, hm);
              cooldownMap.current[pos.symbol] = Date.now() + (cfg.cooldownMinutes || 60) * 60000;
              const pnl = parseFloat(pos.unRealizedProfit || 0);
              addLog(`❌ EXIT ${pos.symbol} | Score scăzut (${analysis.totalScore}) | P&L: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}$`);
            } catch (e) { addLog(`⚠️ Eroare exit ${pos.symbol}: ${e.message}`); }
          }
        }
      }

      // Refresh after exits
      try {
        const data = await binanceRequest(keyId, 'getPositionRisk', {});
        livePositions = Array.isArray(data) ? data.filter(p => parseFloat(p.positionAmt) !== 0) : [];
        setPositions(livePositions);
      } catch {}
    }

    if (livePositions.length >= cfg.maxOpenTrades) {
      addLog(`⏸ Max poziții atinse (${cfg.maxOpenTrades})`);
      botRunningRef.current = false;
      setBotRunning(false);
      return;
    }

    // Scan for entries
    const pairs = isPerpetual
      ? await fetchPerpetualPairs(cfg.scanPairs ?? 50, 500000).catch(() => [])
      : await fetchTopPairs("USDT", cfg.scanPairs ?? 50, 500000).catch(() => []);

    const openSymbols = new Set(livePositions.map(p => p.symbol));
    const now = Date.now();
    const candidates = pairs
      .filter(p => !openSymbols.has(p.symbol))
      .filter(p => !(cooldownMap.current[p.symbol] > now));

    let opened = 0;
    let topScore = 0;
    let topSymbol = "";
    let scanned = 0;
    const BATCH = 20;

    outer: for (let bi = 0; bi < candidates.length; bi += BATCH) {
      const chunk = candidates.slice(bi, bi + BATCH);
      for (const pair of chunk) {
        if (livePositions.length + opened >= cfg.maxOpenTrades) break outer;

        const kl = await fetchKlines(pair.symbol, cfg.timeframe, 80, isPerpetual).catch(() => []);
        if (!kl.length) continue;

        const analysis = analyzePump(kl, {
          use_macd_confirmation: true,
          use_bb_squeeze: true,
          use_adx_filter: true,
          use_obv_divergence: true,
          use_trend_filter: true,
          use_volume_accumulation: true,
          adx_threshold: cfg.adxThreshold ?? 20,
          exhaustion_rsi: cfg.exhaustionRsi ?? 75,
          volume_multiplier: cfg.volumeMultiplier ?? 2.5,
          noise_filter: cfg.noiseFilter ?? true,
        });

        scanned++;
        if (analysis.totalScore > topScore) { topScore = analysis.totalScore; topSymbol = pair.symbol; }

        if (analysis.totalScore >= cfg.minScore) {
          const price = pair.price;
          const stepSize = await getStepSize(pair.symbol);
          const rawQty = cfg.tradeSize / price;
          const quantity = floorToStep(rawQty, stepSize);
          if (quantity <= 0) continue;
          if (quantity * price < 5) continue;
          const pricePrecision = price < 0.0001 ? 8 : price < 0.01 ? 6 : price < 1 ? 5 : price < 100 ? 4 : 2;
          const stopLoss = cfg.autoSL ? parseFloat((price * (1 - cfg.stopLossPct / 100)).toFixed(pricePrecision)) : 0;
          const takeProfit = cfg.autoTP ? parseFloat((price * (1 + cfg.takeProfitPct / 100)).toFixed(pricePrecision)) : 0;

          try {
            const ord = await placeBinanceOrderWithSlTp(keyId, pair.symbol, "BUY", quantity, stopLoss, takeProfit, hm);
            openSymbols.add(pair.symbol);
            opened++;
            const slStatus = ord?.slOrder ? `SL ✓` : ord?.slError ? `SL ✗(${ord.slError})` : "SL —";
            const tpStatus = ord?.tpOrder ? `TP ✓` : ord?.tpError ? `TP ✗(${ord.tpError})` : "TP —";
            addLog(`✅ CUMPĂRAT ${pair.symbol} | Score: ${analysis.totalScore} | Qty: ${quantity} | ${slStatus} | ${tpStatus}`);
          } catch (e) {
            addLog(`⚠️ Eroare ordine ${pair.symbol}: ${e.message}`);
          }
        }
      }
      if (bi + BATCH < candidates.length) await new Promise(r => setTimeout(r, 300));
    }

    if (opened === 0) {
      addLog(`🔍 Scan complet (${scanned} analizate) · Top scor: ${topScore}${topSymbol ? ` pe ${topSymbol}` : ""} · Minim: ${cfg.minScore}`);
    }

    await fetchBalance();
    await fetchPositions();
    botRunningRef.current = false;
    setBotRunning(false);
  }, [fetchBalance, fetchPositions, activeKey]);

  const tfToMs = (tf) => {
    const map = { "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };
    return map[tf] || 3600000;
  };

  const runAutoBotRef = useRef(runAutoBot);
  useEffect(() => { runAutoBotRef.current = runAutoBot; }, [runAutoBot]);

  useEffect(() => {
    if (!autoEnabled || !activeKey) { clearTimeout(autoIntervalRef.current); return; }
    runAutoBotRef.current();
    const scheduleNext = () => {
      const ms = tfToMs(autoConfigRef.current.timeframe);
      autoIntervalRef.current = setTimeout(() => { runAutoBotRef.current(); scheduleNext(); }, ms);
    };
    scheduleNext();
    return () => clearTimeout(autoIntervalRef.current);
  }, [autoEnabled, activeKey]);

  // Manual order
  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!activeKey?.id) throw new Error("Lipsă cheie API");
      setPlacingOrder(true);
      try {
        await placeBinanceOrderWithSlTp(
          activeKey.id,
          orderParams.symbol,
          orderParams.side,
          orderParams.quantity,
          orderParams.stopLoss,
          orderParams.takeProfit,
          hedgeMode
        );
        addLog(`✅ Ordine MARKET plasată: ${orderParams.symbol} ${orderParams.side} qty:${orderParams.quantity}${orderParams.stopLoss > 0 ? ` SL:${orderParams.stopLoss}` : ""}${orderParams.takeProfit > 0 ? ` TP:${orderParams.takeProfit}` : ""}`);
        setOrderDialog(false);
        setTimeout(fetchPositions, 1500);
      } catch (e) {
        addLog(`❌ Eroare ordine: ${e.message}`);
        throw e;
      } finally {
        setPlacingOrder(false);
      }
    },
  });

  const handleClosePosition = async (pos) => {
    if (!activeKey?.id) return;
    try {
      await cancelAllBinanceOrders(activeKey.id, pos.symbol);
      await closeBinancePosition(activeKey.id, pos.symbol, pos.positionAmt, hedgeMode);
      addLog(`🔴 Închis manual: ${pos.symbol}`);
      setTimeout(fetchPositions, 1500);
    } catch (e) { addLog(`⚠️ Eroare închidere ${pos.symbol}: ${e.message}`); }
  };

  if (!subLoading && !isPro) {
    return <PlanGate requiredPlan="pro" feature="Live Trading" />;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">⚡ Live Trading</h1>
            <p className="text-sm text-muted-foreground">Tranzacții reale pe Binance Futures</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${autoEnabled ? "bg-pump-strong/10 border-pump-strong/40" : "bg-secondary border-border"}`}>
            <Bot className={`w-4 h-4 ${autoEnabled ? "text-pump-strong" : "text-muted-foreground"}`} />
            <span className="text-xs font-mono">Auto-Bot</span>
            <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} />
            {botRunning && <Loader2 className="w-3 h-3 animate-spin text-pump-strong" />}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAutoSettings(true)}>
            <Settings className="w-4 h-4 mr-1" /> Bot Setări
          </Button>
          {hedgeMode && <Badge className="bg-chart-blue/20 text-chart-blue border-chart-blue/30">Hedge Mode ON</Badge>}
          {!activeKey && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Lipsă API Key
            </Badge>
          )}
        </div>
      </div>

      {/* Warning */}
      {!activeKey && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          ⚠️ Nu ai nicio cheie API Binance activă. Mergi la <strong>API Keys</strong> pentru a adăuga una.
        </div>
      )}

      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-xs text-yellow-400 font-mono">
        ⚠️ ATENȚIE: Ordinele plasate sunt REALE pe Binance Futures. Riscul de pierdere este real.
      </div>

      {/* Auto Bot Status Bar */}
      {autoEnabled && (
        <div className="bg-pump-strong/10 border border-pump-strong/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-pump-strong" />
            <span className="text-xs font-mono font-semibold text-pump-strong">BOT LIVE ACTIV ⚠️ BANI REALI</span>
            <span className="text-xs text-muted-foreground">
              · TF: <span className="text-primary font-mono">{autoConfig.timeframe}</span>
              · Scor: {autoConfig.minScore}
              · Size: ${autoConfig.tradeSize}
              · Max: {autoConfig.maxOpenTrades}
              · SL: {autoConfig.stopLossPct}%
              · TP: {autoConfig.takeProfitPct}%
            </span>
          </div>
          {botLog.length > 0 && (
            <div className="bg-background/50 rounded-lg p-2 max-h-28 overflow-y-auto space-y-0.5">
              {botLog.map((line, i) => (
                <p key={i} className="text-[10px] font-mono text-muted-foreground">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Control Panel */}
        <div className="space-y-4">
          {/* Balance */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-mono text-muted-foreground uppercase">Balanță Binance Futures</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchBalance} disabled={loadingBalance || !activeKey}>
                <RefreshCw className={`w-3 h-3 ${loadingBalance ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {balance ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold font-mono">${balance.availableBalance.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">disponibil USDT · Total: ${balance.totalWallet?.toFixed(2)}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{activeKey ? "Se încarcă..." : "—"}</p>
            )}
          </div>

          {/* Manual Order Dialog */}
          <Dialog open={orderDialog} onOpenChange={setOrderDialog}>
            <DialogTrigger asChild>
              <Button className="w-full bg-primary hover:bg-primary/90" disabled={!activeKey}>
                <Zap className="w-4 h-4 mr-2" /> Ordine Manuală
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Ordine Market pe Binance Futures</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-xs text-yellow-400">
                  ⚠️ Ordin REAL. Fondurile tale vor fi utilizate.
                </div>
                <div>
                  <Label>Pereche</Label>
                  <Input type="text" value={orderParams.symbol}
                    onChange={e => setOrderParams({ ...orderParams, symbol: e.target.value.toUpperCase() })}
                    placeholder="BTCUSDT" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Side</Label>
                    <Select value={orderParams.side} onValueChange={v => setOrderParams({ ...orderParams, side: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUY">BUY (Long)</SelectItem>
                        <SelectItem value="SELL">SELL (Short)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cantitate</Label>
                    <Input type="number" step="0.001" value={orderParams.quantity}
                      onChange={e => setOrderParams({ ...orderParams, quantity: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Stop Loss (0 = dezactivat)</Label>
                    <Input type="number" step="0.01" value={orderParams.stopLoss}
                      onChange={e => setOrderParams({ ...orderParams, stopLoss: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>Take Profit (0 = dezactivat)</Label>
                    <Input type="number" step="0.01" value={orderParams.takeProfit}
                      onChange={e => setOrderParams({ ...orderParams, takeProfit: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <Button
                  onClick={() => placeOrderMutation.mutate()}
                  disabled={placingOrder || !activeKey}
                  className="w-full bg-destructive hover:bg-destructive/90 font-bold"
                >
                  {placingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  PLASEAZĂ ORDINE REAL
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Bot Log */}
          {botLog.length > 0 && !autoEnabled && (
            <div className="bg-secondary/50 rounded-lg p-3 text-xs font-mono text-muted-foreground max-h-48 overflow-y-auto space-y-0.5">
              {botLog.slice(0, 20).map((line, i) => <p key={i}>{line}</p>)}
            </div>
          )}
        </div>

        {/* Positions Panel */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Poziții Live Binance ({positions.length})</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchPositions} disabled={!activeKey}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            {positions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {autoEnabled ? "Botul scanează semnale..." : "Nicio poziție deschisă."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left p-3">Pereche</th>
                      <th className="text-right p-3">Side</th>
                      <th className="text-right p-3">Qty</th>
                      <th className="text-right p-3">Intrare</th>
                      <th className="text-right p-3">Mark</th>
                      <th className="text-right p-3">P&L $</th>
                      <th className="text-right p-3">Liq.</th>
                      <th className="text-right p-3">Lev.</th>
                      <th className="text-center p-3">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(pos => {
                      const pnl = parseFloat(pos.unRealizedProfit || 0);
                      const entry = parseFloat(pos.entryPrice || 0);
                      const mark = parseFloat(pos.markPrice || 0);
                      const qty = parseFloat(pos.positionAmt || 0);
                      const pnlPct = entry > 0 ? ((mark - entry) / entry) * 100 * (qty > 0 ? 1 : -1) : 0;
                      const isLong = qty > 0;
                      return (
                        <tr key={`${pos.symbol}-${pos.positionSide}`} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="p-3 font-mono font-bold">{pos.symbol}</td>
                          <td className="p-3 text-right">
                            <Badge className={isLong ? "bg-chart-green/20 text-chart-green" : "bg-chart-red/20 text-chart-red"}>
                              {isLong ? "LONG" : "SHORT"}
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-mono">{Math.abs(qty).toFixed(4)}</td>
                          <td className="p-3 text-right font-mono">${formatPrice(entry)}</td>
                          <td className="p-3 text-right font-mono">${formatPrice(mark)}</td>
                          <td className={`p-3 text-right font-mono font-bold ${pnl >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}$
                            <br />
                            <span className="text-[10px] opacity-70">{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
                          </td>
                          <td className="p-3 text-right font-mono">${formatPrice(parseFloat(pos.liquidationPrice || 0))}</td>
                          <td className="p-3 text-right font-mono">{pos.leverage || "—"}x</td>
                          <td className="p-3 text-center">
                            <Button variant="destructive" size="sm" onClick={() => handleClosePosition(pos)}>
                              Închide
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
        </div>
      </div>

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