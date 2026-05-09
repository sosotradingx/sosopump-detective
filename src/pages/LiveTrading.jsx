import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchPerpetualPairs, fetchTopPairs, fetchKlines, formatPrice } from "../components/scanner/kucoinApi";
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

// KuCoin uses standard lot sizes - 0.001 is default
const stepSizeCache = {};
async function getStepSize(symbol) {
  if (stepSizeCache[symbol]) return stepSizeCache[symbol];
  // KuCoin generally uses 0.001 for most contracts, no need to fetch
  stepSizeCache[symbol] = 0.001;
  return 0.001;
}

// Round quantity down to the nearest stepSize
function floorToStep(qty, step) {
  if (!step || step === 0) return qty;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  return parseFloat((Math.floor(qty / step) * step).toFixed(precision));
}

// --- KuCoin signed calls ---
async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function kucoinRequest(apiKey, apiSecret, method, path, params = {}) {
  const timestamp = Date.now();
  const body = method === 'GET' ? null : JSON.stringify(params);
  const message = `${timestamp}${method}${path}${body || ''}`;
  const sig = await hmacSha256(message, apiSecret);
  
  const url = `https://api-futures.kucoin.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'KC-API-KEY': apiKey,
      'KC-API-SECRET': apiSecret,
      'KC-API-PASSPHRASE': apiSecret,
      'KC-API-TIMESTAMP': timestamp.toString(),
      'KC-API-SIGN': sig,
      'Content-Type': 'application/json'
    },
    body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || `KuCoin error ${res.status}`);
  return data.data || data;
}

async function getDecryptedCreds(keyId) {
  const res = await base44.functions.invoke("decryptApiSecret", { keyId });
  return { apiKey: res.data?.key, apiSecret: res.data?.secret, apiPassphrase: res.data?.passphrase };
}

async function placeMarketWithSlTp(creds, symbol, side, quantity, stopLoss, takeProfit) {
  const { apiKey, apiSecret } = creds;
  const closeSide = side === "BUY" ? "sell" : "buy";

  // 1. Main MARKET order via KuCoin
  const mainOrder = await kucoinRequest(apiKey, apiSecret, 'POST', '/api/v1/orders', {
    symbol, side: side.toLowerCase(), type: 'market', size: quantity.toString()
  });

  const results = { mainOrder, slOrder: null, tpOrder: null, slError: null, tpError: null };

  // 2. Stop Loss (stop order on KuCoin)
  if (stopLoss > 0) {
    try {
      results.slOrder = await kucoinRequest(apiKey, apiSecret, 'POST', '/api/v1/orders', {
        symbol, side: closeSide, type: 'stop', stopPrice: stopLoss.toString(), size: quantity.toString()
      });
    } catch (e) { results.slError = e.message; }
  }

  // 3. Take Profit (limit order)
  if (takeProfit > 0) {
    try {
      results.tpOrder = await kucoinRequest(apiKey, apiSecret, 'POST', '/api/v1/orders', {
        symbol, side: closeSide, type: 'limit', price: takeProfit.toString(), size: quantity.toString()
      });
    } catch (e) { results.tpError = e.message; }
  }

  return results;
}

async function closePosition(creds, symbol, positionAmt) {
  const { apiKey, apiSecret } = creds;
  const qty = Math.abs(parseFloat(positionAmt));
  const side = parseFloat(positionAmt) > 0 ? "sell" : "buy";
  return kucoinRequest(apiKey, apiSecret, 'POST', '/api/v1/orders', {
    symbol, side, type: 'market', size: qty.toString()
  });
}

async function cancelAllOrders(creds, symbol) {
  try {
    await kucoinRequest(creds.apiKey, creds.apiSecret, 'DELETE', '/api/v1/orders', { symbol });
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
    const saved = localStorage.getItem("soso_live_auto_config");
    if (saved) return { ...DEFAULT_AUTO_CONFIG, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_AUTO_CONFIG;
}

function saveAutoConfig(cfg) {
  try { localStorage.setItem("soso_live_auto_config", JSON.stringify(cfg)); } catch {}
}

export default function LiveTrading() {
  const { isPro, loading: subLoading } = useSubscription();
  const [user, setUser] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [positions, setPositions] = useState([]);
  const [orderDialog, setOrderDialog] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderParams, setOrderParams] = useState({ symbol: "BTCUSDT", side: "BUY", quantity: 0.01, price: 0 });

  // Auto-bot state
  const [autoEnabled, setAutoEnabled] = useState(() => {
    try { return localStorage.getItem("soso_live_auto_enabled") === "true"; } catch { return false; }
  });
  const [autoConfig, setAutoConfig] = useState(loadAutoConfig);
  const [showAutoSettings, setShowAutoSettings] = useState(false);
  const [botLog, setBotLog] = useState([]);
  const [botRunning, setBotRunning] = useState(false);
  const [hedgeMode, setHedgeMode] = useState(false);
  const botRunningRef = useRef(false);
  const autoConfigRef = useRef(autoConfig);
  const autoIntervalRef = useRef(null);
  const cooldownMap = useRef({});
  const credentialsRef = useRef(null);
  const hedgeModeRef = useRef(false);

  useEffect(() => { autoConfigRef.current = autoConfig; }, [autoConfig]);
  useEffect(() => { credentialsRef.current = credentials; }, [credentials]);
  useEffect(() => { hedgeModeRef.current = hedgeMode; }, [hedgeMode]);
  useEffect(() => { saveAutoConfig(autoConfig); }, [autoConfig]);
  useEffect(() => { try { localStorage.setItem("soso_live_auto_enabled", String(autoEnabled)); } catch {} }, [autoEnabled]);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["userApiKeys", user?.email],
    queryFn: () => base44.entities.UserApiKey.filter({ created_by: user.email }, "-created_date", 10),
    enabled: !!user,
  });

  useEffect(() => {
    if (apiKeys.length > 0 && !activeKey) {
      const active = apiKeys.find(k => k.is_active) || apiKeys[0];
      setActiveKey(active);
    }
  }, [apiKeys, activeKey]);

  useEffect(() => {
    if (!activeKey) return;
    setCredentials(null);
    // Decrypt and load real credentials for direct frontend calls
    getDecryptedCreds(activeKey.id).then(creds => {
      setCredentials(creds);
      credentialsRef.current = creds;
      // KuCoin doesn't use hedge mode like Binance
      setHedgeMode(false);
      hedgeModeRef.current = false;
      addLog(`ℹ️ Conectat la KuCoin Futures`);
    }).catch(e => addLog(`❌ Eroare credențiale: ${e.message}`));
  }, [activeKey]);

  const addLog = (msg) => setBotLog(prev => [`[${new Date().toLocaleTimeString("ro-RO")}] ${msg}`, ...prev.slice(0, 49)]);

  const fetchBalance = useCallback(async () => {
    const creds = credentialsRef.current;
    if (!creds?.apiKey) return;
    setLoadingBalance(true);
    try {
      const accts = await kucoinRequest(creds.apiKey, creds.apiSecret, 'GET', '/api/v1/accounts', {});
      const accounts = Array.isArray(accts) ? accts : accts?.accounts || [];
      const mainAcct = accounts.find(a => a.type === 'MARGIN') || accounts[0] || {};
      setBalance({
        availableBalance: parseFloat(mainAcct.available || 0),
        totalWallet: parseFloat(mainAcct.balance || 0),
        asset: 'USDT'
      });
    } catch (e) { addLog(`❌ Balanță: ${e.message}`); }
    setLoadingBalance(false);
  }, []);

  const fetchPositions = useCallback(async () => {
    const creds = credentialsRef.current;
    if (!creds?.apiKey) return;
    try {
      const data = await kucoinRequest(creds.apiKey, creds.apiSecret, 'GET', '/api/v1/positions', {});
      const positions = Array.isArray(data) ? data : data?.positions || [];
      setPositions(positions.filter(p => parseFloat(p.currentQty || 0) !== 0));
    } catch (e) { console.error("Positions error:", e.message); }
  }, []);

  useEffect(() => {
    if (!credentials) return;
    fetchBalance();
    fetchPositions();
    const interval = setInterval(() => { fetchBalance(); fetchPositions(); }, 15000);
    return () => clearInterval(interval);
  }, [credentials, fetchBalance, fetchPositions]);

  // --- Auto-bot logic ---
  const runAutoBot = useCallback(async () => {
    if (botRunningRef.current) return;
    const creds = credentialsRef.current;
    if (!creds?.apiKey) { addLog("⚠️ Bot: credențiale lipsă"); return; }

    botRunningRef.current = true;
    setBotRunning(true);

    const cfg = autoConfigRef.current;
    const isPerpetual = cfg.marketSource !== "spot";

    // Fetch live positions directly
    let livePositions = [];
    try {
      const posData = await kucoinRequest(creds.apiKey, creds.apiSecret, 'GET', '/api/v1/positions', {});
      const positions = Array.isArray(posData) ? posData : posData?.positions || [];
      livePositions = positions.filter(p => parseFloat(p.currentQty || 0) !== 0);
      setPositions(livePositions);
    } catch (e) {
      addLog(`❌ Poziții: ${e.message}`);
      botRunningRef.current = false;
      setBotRunning(false);
      return;
    }

    // --- Check exit conditions for open positions ---
    for (const pos of livePositions) {
      const curPrice = parseFloat(pos.currentPrice || pos.avgEntryPrice);
      const entryPrice = parseFloat(pos.avgEntryPrice);
      const pnlPct = ((curPrice - entryPrice) / entryPrice) * 100;

      // Auto-exit on low score
      if (cfg.autoExitLowScore) {
        const kl = await fetchKlines(pos.symbol, cfg.timeframe, 60, isPerpetual).catch(() => []);
        if (kl.length > 0) {
          const analysis = analyzePump(kl);
          if (analysis.totalScore < 20) {
            try {
              await cancelAllOrders(creds, pos.symbol);
              await closePosition(creds, pos.symbol, pos.positionAmt, hedgeModeRef.current);
              cooldownMap.current[pos.symbol] = Date.now() + (cfg.cooldownMinutes || 60) * 60000;
              addLog(`❌ EXIT ${pos.symbol} | Score scăzut (${analysis.totalScore}) | P&L: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`);
            } catch (e) { addLog(`⚠️ Eroare exit ${pos.symbol}: ${e.message}`); }
          }
        }
      }
    }

    // Refresh positions after exits
    try {
      const posData = await kucoinRequest(creds.apiKey, creds.apiSecret, 'GET', '/api/v1/positions', {});
      const positions = Array.isArray(posData) ? posData : posData?.positions || [];
      livePositions = positions.filter(p => parseFloat(p.currentQty || 0) !== 0);
      setPositions(livePositions);
    } catch {}

    // Check max open positions
    if (livePositions.length >= cfg.maxOpenTrades) {
      addLog(`⏸ Max poziții atinse (${cfg.maxOpenTrades})`);
      botRunningRef.current = false;
      setBotRunning(false);
      return;
    }

    // --- Scan for new entries ---
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
          if (quantity * price < 5) continue; // skip if notional < $5 min
          const pricePrecision = price < 0.0001 ? 8 : price < 0.01 ? 6 : price < 1 ? 5 : price < 100 ? 4 : 2;
          const stopLoss = cfg.autoSL
            ? parseFloat((price * (1 - cfg.stopLossPct / 100)).toFixed(pricePrecision))
            : 0;
          const takeProfit = cfg.autoTP
            ? parseFloat((price * (1 + cfg.takeProfitPct / 100)).toFixed(pricePrecision))
            : 0;

          try {
            const ord = await placeMarketWithSlTp(creds, pair.symbol, "BUY", quantity, stopLoss, takeProfit);
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

    // Refresh balance & positions
    await fetchBalance();
    await fetchPositions();
    botRunningRef.current = false;
    setBotRunning(false);
  }, [fetchBalance, fetchPositions]);

  const tfToMs = (tf) => {
    const map = { "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };
    return map[tf] || 3600000;
  };

  const runAutoBotRef = useRef(runAutoBot);
  useEffect(() => { runAutoBotRef.current = runAutoBot; }, [runAutoBot]);

  useEffect(() => {
    if (!autoEnabled || !credentials) { clearTimeout(autoIntervalRef.current); return; }
    runAutoBotRef.current();
    const scheduleNext = () => {
      const ms = tfToMs(autoConfigRef.current.timeframe);
      autoIntervalRef.current = setTimeout(() => { runAutoBotRef.current(); scheduleNext(); }, ms);
    };
    scheduleNext();
    return () => clearTimeout(autoIntervalRef.current);
  }, [autoEnabled, credentials]);

  // Place manual limit order
  const placeOrderMutation = useMutation({
    mutationFn: async () => {
       if (!credentials?.apiKey) throw new Error("Credențialele nu sunt disponibile");
       setPlacingOrder(true);
       try {
         await kucoinRequest(credentials.apiKey, credentials.apiSecret, 'POST', '/api/v1/orders', {
           symbol: orderParams.symbol,
           side: orderParams.side.toLowerCase(),
           type: "limit",
           price: orderParams.price.toString(),
           size: orderParams.quantity.toString(),
         });
         addLog(`✅ Ordine LIMIT plasată: ${orderParams.symbol} ${orderParams.side} qty:${orderParams.quantity} @${orderParams.price}`);
         setOrderDialog(false);
         fetchPositions();
       } catch (e) {
         addLog(`❌ Eroare ordine: ${e.message}`);
         throw e;
       } finally {
         setPlacingOrder(false);
       }
     },
  });

  const handleClosePosition = async (pos) => {
    if (!credentials?.apiKey) return;
    try {
      await cancelAllOrders(credentials, pos.symbol);
      await closePosition(credentials, pos.symbol, pos.positionAmt, hedgeMode);
      addLog(`🔴 Închis manual: ${pos.symbol}`);
      setTimeout(fetchPositions, 1000);
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
            <p className="text-sm text-muted-foreground">Tranzacții reale pe KuCoin Futures</p>
          </div>
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
          {!activeKey && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Lipsă API Key
            </Badge>
          )}
        </div>
      </div>

      {/* Warnings */}
      {!activeKey && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          ⚠️ Nu ai nicio cheie API activă. Mergi la <strong>API Keys</strong> pentru a adăuga una.
        </div>
      )}
      {activeKey && !credentials?.apiKey && (
        <div className="bg-secondary/50 border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă credențialele API...
        </div>
      )}

      {/* Auto Bot Status Bar */}
      {autoEnabled && (
        <div className="bg-pump-strong/10 border border-pump-strong/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-pump-strong" />
            <span className="text-xs font-mono font-semibold text-pump-strong">BOT LIVE ACTIV ⚠️ REAL MONEY</span>
            <span className="text-xs text-muted-foreground">
              · TF: <span className="text-primary font-mono">{autoConfig.timeframe}</span>
              · Scor minim: {autoConfig.minScore}
              · Trad size: ${autoConfig.tradeSize}
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
              <p className="text-xs font-mono text-muted-foreground uppercase">Balanță KuCoin</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchBalance} disabled={loadingBalance || !credentials}>
                <RefreshCw className={`w-3 h-3 ${loadingBalance ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {balance?.availableBalance > 0 ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold font-mono">${balance.availableBalance.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">disponibil {balance.asset} · Total: {balance.totalWallet?.toFixed(2)}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{credentials ? "Se încarcă..." : "—"}</p>
            )}
          </div>

          {/* Manual Order */}
          <Dialog open={orderDialog} onOpenChange={setOrderDialog}>
            <DialogTrigger asChild>
              <Button className="w-full bg-primary hover:bg-primary/90" disabled={!credentials}>
                <Zap className="w-4 h-4 mr-2" /> Ordine Manuală
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Ordine Limit Manuală</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
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
                        <SelectItem value="BUY">BUY</SelectItem>
                        <SelectItem value="SELL">SELL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cantitate</Label>
                    <Input type="number" step="0.001" value={orderParams.quantity}
                      onChange={e => setOrderParams({ ...orderParams, quantity: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <div>
                  <Label>Preț Limit</Label>
                  <Input type="number" step="0.01" value={orderParams.price}
                    onChange={e => setOrderParams({ ...orderParams, price: parseFloat(e.target.value) || 0 })} />
                </div>
                <Button onClick={() => placeOrderMutation.mutate()} disabled={placingOrder || !credentials}
                  className="w-full bg-pump-strong hover:bg-pump-strong/90">
                  {placingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Plasează
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
          {/* Live Positions */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Poziții Live ({positions.length})</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchPositions} disabled={!credentials}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            {positions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {credentials ? (autoEnabled ? "Botul scanează semnale..." : "Nicio poziție deschisă.") : "Conectare API..."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left p-3">Pereche</th>
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
                      const pnlPct = entry > 0 ? ((mark - entry) / entry) * 100 : 0;
                      return (
                        <tr key={pos.symbol} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="p-3 font-mono font-bold">{pos.symbol}</td>
                          <td className="p-3 text-right font-mono">{parseFloat(pos.positionAmt || 0).toFixed(4)}</td>
                          <td className="p-3 text-right font-mono">${formatPrice(entry)}</td>
                          <td className="p-3 text-right font-mono">${formatPrice(mark)}</td>
                          <td className={`p-3 text-right font-mono font-bold ${pnl >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
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