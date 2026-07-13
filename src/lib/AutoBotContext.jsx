import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { fetchTopPairs, fetchPerpetualPairs, fetchKlines } from "@/components/scanner/binanceApi";
import { analyzePump } from "@/components/scanner/pumpEngine";
import { analyzeVVF, getVVFApproval } from "@/components/scanner/vvfEngine";

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
  usePartialTP: false,
  partialTPTarget: 10,
  partialTPPercent: 50,
  moveSlToBreakeven: true,
  useVvfConfirmation: true,
  vvfMinConfidence: 60,
  vvfMinUnifiedScore: 25,
  vvfRequireBullFvg: true,
  vvfBlockManipulation: true,
  vvfBlockLiquidityHeat: true,
  vvfBlockVulnerability: true,
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

// Flag la nivel de modul - previne sesiuni de scan concurente
let paperBotRunningGlobal = false;

// Session lock persistat în localStorage - detectează și oprește sesiuni vechi,
// chiar și din alte tab-uri ale browserului.
function startNewBotSession() {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem("soso_bot_session_id", id); } catch {}
  return id;
}
function isActiveBotSession(id) {
  try { return localStorage.getItem("soso_bot_session_id") === id; } catch { return true; }
}

const AutoBotContext = createContext(null);

// Provider montat o singură dată la nivel de aplicație (nu în interiorul unei pagini),
// astfel încât botul să continue să scaneze chiar dacă utilizatorul navighează pe alte pagini.
export function AutoBotProvider({ children }) {
  const queryClient = useQueryClient();
  const [autoEnabled, setAutoEnabled] = useState(() => {
    try { return localStorage.getItem("soso_auto_enabled") === "true"; } catch { return false; }
  });
  const [autoConfig, setAutoConfig] = useState(loadAutoConfig);
  const [botLog, setBotLog] = useState([]);
  const [botRunning, setBotRunning] = useState(false);
  const autoConfigRef = useRef(autoConfig);
  const autoIntervalRef = useRef(null);
  const botSessionRecordIdRef = useRef(null);

  useEffect(() => { saveAutoConfig(autoConfig); }, [autoConfig]);
  useEffect(() => { try { localStorage.setItem("soso_auto_enabled", String(autoEnabled)); } catch {} }, [autoEnabled]);
  useEffect(() => { autoConfigRef.current = autoConfig; }, [autoConfig]);

  const runAutoBot = useCallback(async (sessionId) => {
    if (paperBotRunningGlobal) return;
    if (sessionId && !isActiveBotSession(sessionId)) return; // o sesiune mai nouă a preluat deja controlul
    paperBotRunningGlobal = true;
    setBotRunning(true);

    try {
    const cfg = autoConfigRef.current;
    const currentUser = await base44.auth.me();
    const currentTrades = currentUser
      ? await base44.entities.PaperTrade.filter({ created_by: currentUser.email }, "-created_date", 5000)
      : [];
    const openTrades = currentTrades.filter(t => t.status === "open");
    const isPerpetual = cfg.marketSource !== "spot";
    const pairs = isPerpetual
      ? await fetchPerpetualPairs(cfg.scanPairs ?? 100, 500000)
      : await fetchTopPairs("USDT", cfg.scanPairs ?? 100, 500000);
    const priceMap = {};
    pairs.forEach(p => { priceMap[p.symbol] = p.price; });

    const log = (msg) => setBotLog(prev => [`[${new Date().toLocaleTimeString("ro-RO")}] ${msg}`, ...prev.slice(0, 29)]);

    // --- Fetch prices for open trades that may not be in priceMap (e.g. outside top N) ---
    const missingSymbols = openTrades.filter(t => !priceMap[t.symbol]).map(t => t.symbol);
    if (missingSymbols.length > 0) {
      const fapiBase = isPerpetual ? "https://fapi.binance.com/fapi/v1" : "https://api.binance.com/api/v3";
      await Promise.all(missingSymbols.map(async (sym) => {
        const r = await fetch(`${fapiBase}/ticker/price?symbol=${sym}`);
        const d = await r.json();
        if (d.price) priceMap[sym] = parseFloat(d.price);
      }));
    }

    // --- Check open trades for exit conditions ---
     for (const trade of openTrades) {
       const cur = priceMap[trade.symbol] || trade.entry_price;
       const pnlPct = ((cur - trade.entry_price) / trade.entry_price) * 100;
       let reason = null;

       if (trade.stop_loss > 0 && cur <= trade.stop_loss) {
         reason = "stop_loss";
       }
       else if (trade.take_profit > 0 && cur >= trade.take_profit) {
         reason = "take_profit";
       }

       if (!reason && cfg.usePartialTP && !trade.partial_tp_hit) {
        const tp1Price = trade.entry_price * (1 + (cfg.partialTPTarget ?? 10) / 100);
        if (cur >= tp1Price && trade.quantity > 0) {
          const partialQty = Math.round(trade.quantity * ((cfg.partialTPPercent ?? 50) / 100) * 10000) / 10000;
          const remainQty = Math.round((trade.quantity - partialQty) * 10000) / 10000;
          const partialPnlUsd = (cur - trade.entry_price) * partialQty;
          const partialPnlPct = pnlPct;

          await base44.entities.PaperTrade.create({
            symbol: trade.symbol,
            side: "BUY",
            status: "closed",
            entry_price: trade.entry_price,
            exit_price: cur,
            quantity: partialQty,
            pump_score_at_entry: trade.pump_score_at_entry,
            stop_loss: trade.stop_loss,
            take_profit: trade.take_profit,
            partial_tp_hit: false,
            pnl_percent: Math.round(partialPnlPct * 100) / 100,
            pnl_usd: Math.round(partialPnlUsd * 100) / 100,
            exit_reason: "partial_tp",
            notes: `Partial TP1 (${cfg.partialTPPercent ?? 50}%) | ${trade.notes || ""}`,
          });

          const newSL = cfg.moveSlToBreakeven ? trade.entry_price : trade.stop_loss;
          await base44.entities.PaperTrade.update(trade.id, {
            quantity: remainQty,
            partial_tp_hit: true,
            stop_loss: newSL,
            notes: `${trade.notes || ""} | TP1 executat la ${cur.toFixed(4)}`,
          });

          log(`🎯 PARTIAL TP ${trade.symbol} | Vândut ${cfg.partialTPPercent ?? 50}% la +${partialPnlPct.toFixed(2)}% | Rămâne: ${remainQty}${cfg.moveSlToBreakeven ? " | SL→Breakeven" : ""}`);
          continue;
          }
          }

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

         log(`❌ ÎNCHIS ${trade.symbol} | ${reason} | P&L: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% | Cooldown: ${cfg.cooldownMinutes}min`);
       }
    }

    // --- Open new trades ---
    const freshUser = await base44.auth.me();
    const allFreshTrades = freshUser
      ? await base44.entities.PaperTrade.filter({ created_by: freshUser.email }, "-created_date", 5000)
      : [];
    const freshOpen = allFreshTrades.filter(t => t.status === "open");
    const freshClosed = allFreshTrades.filter(t => t.status === "closed");
    const openSymbols = new Set(freshOpen.map(t => t.symbol));

    const INITIAL_BALANCE = 10000;
    const realizedPnL = freshClosed.reduce((s, t) => s + (t.pnl_usd || 0), 0);
    const lockedCapital = freshOpen.reduce((s, t) => s + (t.entry_price * t.quantity), 0);
    const availableBalance = INITIAL_BALANCE + realizedPnL - lockedCapital;

    if (availableBalance < cfg.tradeSize) {
      log(`🚫 Balanță insuficientă: $${availableBalance.toFixed(2)} < $${cfg.tradeSize} necesar`);
      queryClient.invalidateQueries({ queryKey: ["paper-trades"] });
      return;
    }

    if (freshOpen.length >= cfg.maxOpenTrades) {
      log(`⏸ Max poziții atinse (${cfg.maxOpenTrades})`);
      queryClient.invalidateQueries({ queryKey: ["paper-trades"] });
      return;
    }

    const now = Date.now();
    const cooldownMs = (cfg.cooldownMinutes || 60) * 60 * 1000;
    const lastClosedMap = {};
    freshClosed.forEach(t => {
      const closedAt = new Date(t.updated_date || t.created_date).getTime();
      if (!lastClosedMap[t.symbol] || closedAt > lastClosedMap[t.symbol]) {
        lastClosedMap[t.symbol] = closedAt;
      }
    });
    const candidates = pairs
      .filter(p => !openSymbols.has(p.symbol))
      .filter(p => {
        const lastClosed = lastClosedMap[p.symbol];
        return !(lastClosed && (now - lastClosed) < cooldownMs);
      })
      .slice(0, Math.min(cfg.scanPairs ?? 100, pairs.length));

    let opened = 0;
    let scanned = 0;
    let topScore = 0;
    let topSymbol = "";
    let runningBalance = availableBalance;

    const BATCH = 25;
    outer: for (let bi = 0; bi < candidates.length; bi += BATCH) {
      if (sessionId && !isActiveBotSession(sessionId)) {
        log(`⏹ Sesiune veche oprită - o sesiune nouă a preluat controlul`);
        break outer;
      }
      const chunk = candidates.slice(bi, bi + BATCH);
      for (const pair of chunk) {
      if (freshOpen.length + opened >= cfg.maxOpenTrades) break outer;
      if (runningBalance < cfg.tradeSize) break outer;
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

      scanned++;
      if (analysis.totalScore > topScore) {
        topScore = analysis.totalScore;
        topSymbol = pair.symbol;
      }

      if (analysis.totalScore >= cfg.minScore) {
        const vvf = analyzeVVF(kl);
        const vvfApproval = getVVFApproval("BUY", vvf, cfg);
        if (!vvfApproval.approved) {
          log(`⛔ VVF BLOCKED ${pair.symbol} | ${vvfApproval.reason} | Pump Score: ${analysis.totalScore}`);
          continue;
        }

        if (runningBalance < cfg.tradeSize) {
          log(`🚫 Capital insuficient pentru ${pair.symbol}: $${runningBalance.toFixed(2)} disponibil`);
          break outer;
        }
        const dupCheck = await base44.entities.PaperTrade.filter({ created_by: freshUser.email, symbol: pair.symbol, status: "open" }, "-created_date", 1);
        if (dupCheck.length > 0) {
          openSymbols.add(pair.symbol);
          continue;
        }

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
          notes: `Auto | TF:${cfg.timeframe} | Score:${analysis.totalScore} | ${analysis.pumpStatus} | VVF:${vvfApproval.confidence}%`,
        });
        openSymbols.add(pair.symbol);
        runningBalance -= cfg.tradeSize;
        log(`✅ DESCHIS ${pair.symbol} | Score: ${analysis.totalScore} | Balanță rămasă: $${runningBalance.toFixed(2)}`);
        opened++;
      }
      }
      if (bi + BATCH < candidates.length) await new Promise(r => setTimeout(r, 300));
    }

    if (opened === 0) {
      log(`🔍 Scan complet (${scanned}/${candidates.length} analizate) · Scor minim: ${cfg.minScore} · Top scor găsit: ${topScore}${topSymbol ? ` pe ${topSymbol}` : ""} · ${topScore < cfg.minScore ? `Încearcă scor minim ≤ ${topScore}` : "Semnal dispărut"}`);
    }
    queryClient.invalidateQueries({ queryKey: ["paper-trades"] });
    } finally {
      paperBotRunningGlobal = false;
      setBotRunning(false);
    }
  }, [queryClient]);

  const tfToMs = (tf) => {
    const map = { "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };
    return map[tf] || 60000;
  };

  const runAutoBotRef = useRef(runAutoBot);
  useEffect(() => { runAutoBotRef.current = runAutoBot; }, [runAutoBot]);

  // Start/stop auto bot interval — montat o singură dată la nivel de app, nu se oprește la navigare între pagini
  useEffect(() => {
    if (!autoEnabled) {
      clearInterval(autoIntervalRef.current);
      return;
    }
    const sessionId = startNewBotSession();
    base44.entities.BotSession.create({
      session_id: sessionId,
      status: "running",
      started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
      timeframe: autoConfigRef.current.timeframe,
    }).then(rec => { botSessionRecordIdRef.current = rec.id; }).catch(() => {});
    runAutoBotRef.current(sessionId);
    const scheduleNext = () => {
      const intervalMs = tfToMs(autoConfigRef.current.timeframe);
      autoIntervalRef.current = setTimeout(() => {
        runAutoBotRef.current(sessionId);
        scheduleNext();
      }, intervalMs);
    };
    scheduleNext();
    return () => {
      clearTimeout(autoIntervalRef.current);
      if (botSessionRecordIdRef.current) {
        base44.entities.BotSession.update(botSessionRecordIdRef.current, { status: "stopped" }).catch(() => {});
        botSessionRecordIdRef.current = null;
      }
    };
  }, [autoEnabled]);

  // Heartbeat - marchează periodic sesiunea ca activă, pentru pagina Bot Status
  useEffect(() => {
    if (!autoEnabled) return;
    const hb = setInterval(() => {
      if (botSessionRecordIdRef.current) {
        base44.entities.BotSession.update(botSessionRecordIdRef.current, { last_heartbeat: new Date().toISOString() }).catch(() => {});
      }
    }, 20000);
    return () => clearInterval(hb);
  }, [autoEnabled]);

  return (
    <AutoBotContext.Provider value={{ autoEnabled, setAutoEnabled, autoConfig, setAutoConfig, botLog, botRunning }}>
      {children}
    </AutoBotContext.Provider>
  );
}

export function useAutoBot() {
  const ctx = useContext(AutoBotContext);
  if (!ctx) throw new Error("useAutoBot must be used within AutoBotProvider");
  return ctx;
}