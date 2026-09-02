import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { fetchPerpetualPairs, fetchTopPairs, fetchKlines } from "@/components/scanner/binanceApi";
import { analyzeHarmonics } from "@/lib/harmonicEngine";

const DEFAULT_HARMONIC_CONFIG = {
  initialBalance: 10000,
  tradeSize: 200,
  maxOpenTrades: 5,
  timeframe: "1h",
  sensitivity: "fast",
  minConf: 15,
  scanPairs: 30,
  scanIntervalMinutes: 5,
  exitTP: "tp2",
  marketSource: "perpetuals",
};

function loadHarmonicConfig() {
  try {
    const saved = localStorage.getItem("soso_harmonic_config");
    if (saved) return { ...DEFAULT_HARMONIC_CONFIG, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_HARMONIC_CONFIG;
}
function saveHarmonicConfig(cfg) {
  try { localStorage.setItem("soso_harmonic_config", JSON.stringify(cfg)); } catch {}
}

let harmonicScanRunning = false;
let harmonicMonitorRunning = false;

const HarmonicBotContext = createContext(null);

export function HarmonicBotProvider({ children }) {
  const queryClient = useQueryClient();
  const [harmonicEnabled, setHarmonicEnabled] = useState(() => {
    try { return localStorage.getItem("soso_harmonic_enabled") === "true"; } catch { return false; }
  });
  const [harmonicConfig, setHarmonicConfig] = useState(loadHarmonicConfig);
  const [harmonicLog, setHarmonicLog] = useState([]);
  const [harmonicRunning, setHarmonicRunning] = useState(false);
  const [pendingSignals, setPendingSignals] = useState([]);
  const [harmonicOpen, setHarmonicOpen] = useState([]);
  const [harmonicClosed, setHarmonicClosed] = useState([]);
  const [lastScanAt, setLastScanAt] = useState(null);

  const cfgRef = useRef(harmonicConfig);
  const scanTimerRef = useRef(null);
  const monitorTimerRef = useRef(null);
  const realizedPnLRef = useRef(0);
  const activityRef = useRef(false);

  useEffect(() => { cfgRef.current = harmonicConfig; saveHarmonicConfig(harmonicConfig); }, [harmonicConfig]);
  useEffect(() => { try { localStorage.setItem("soso_harmonic_enabled", String(harmonicEnabled)); } catch {} }, [harmonicEnabled]);

  const log = useCallback((msg) => setHarmonicLog(prev => [`[${new Date().toLocaleTimeString("ro-RO")}] ${msg}`, ...prev.slice(0, 39)]), []);

  const isHarmonic = (t) => !!(t && t.notes && t.notes.startsWith("HARM"));

  const refreshLists = useCallback(async (user) => {
    if (!user) return;
    try {
      const [pend, open, closed] = await Promise.all([
        base44.entities.HarmonicSignal.filter({ created_by: user.email, status: "pending" }, "-created_date", 200).catch(() => []),
        base44.entities.PaperTrade.filter({ created_by: user.email, status: "open" }, "-created_date", 200).catch(() => []),
        base44.entities.PaperTrade.filter({ created_by: user.email, status: "closed" }, "-created_date", 5000).catch(() => []),
      ]);
      setPendingSignals(pend);
      setHarmonicOpen(open.filter(isHarmonic));
      setHarmonicClosed(closed.filter(isHarmonic));
    } catch {}
  }, []);

  // Initialize realized PnL from closed harmonic trades
  useEffect(() => {
    (async () => {
      const u = await base44.auth.me().catch(() => null);
      if (!u) return;
      const closed = await base44.entities.PaperTrade.filter({ created_by: u.email, status: "closed" }, "-created_date", 5000).catch(() => []);
      realizedPnLRef.current = closed.filter(isHarmonic).reduce((s, t) => s + (t.pnl_usd || 0), 0);
      await refreshLists(u);
    })();
  }, [refreshLists]);

  // === SCAN: detect NEW completed harmonic patterns -> create pending signals ===
  const runHarmonicScan = useCallback(async () => {
    if (harmonicScanRunning) return;
    harmonicScanRunning = true;
    setHarmonicRunning(true);
    try {
      const cfg = cfgRef.current;
      const user = await base44.auth.me().catch(() => null);
      if (!user) return;
      const isPerp = cfg.marketSource !== "spot";
      const raw = cfg.scanPairs != null ? cfg.scanPairs : 30; // 0 = toate monedele
      const pairs = isPerp
        ? await fetchPerpetualPairs(raw, 500000)
        : await fetchTopPairs("USDT", raw > 0 ? raw : 9999, 500000);

      const existing = await base44.entities.HarmonicSignal.filter({ created_by: user.email }, "-created_date", 2000).catch(() => []);
      const seen = new Set(existing.map(s => `${s.symbol}|${s.d_pivot_time}|${s.pattern_name}`));

      let scanned = 0, newSignals = 0;
      const BATCH = 12;
      for (let bi = 0; bi < pairs.length; bi += BATCH) {
        const chunk = pairs.slice(bi, bi + BATCH);
        await Promise.all(chunk.map(async (pair) => {
          try {
            scanned++;
            const kl = await fetchKlines(pair.symbol, cfg.timeframe, 200, isPerp);
            if (!kl || kl.length < 60) return;
            const { patterns } = analyzeHarmonics(kl, cfg.sensitivity || "fast");
            const comp = patterns.find(p => p.completed && p.conf >= (cfg.minConf ?? 15));
            if (!comp) return;
            const dTimeMs = kl[comp.bars.bD]?.time;
            if (!dTimeMs) return;
            const dIso = new Date(dTimeMs).toISOString();
            const key = `${pair.symbol}|${dIso}|${comp.name}`;
            if (seen.has(key)) return;
            seen.add(key);
            const side = comp.dir === 1 ? "BUY" : "SELL";
            await base44.entities.HarmonicSignal.create({
              symbol: pair.symbol, pattern_name: comp.name, side, dir: comp.dir,
              entry: comp.entry, sl: comp.sl, tp1: comp.tp1, tp2: comp.tp2, tp3: comp.tp3,
              prz_top: comp.przZone.top, prz_bottom: comp.przZone.bottom,
              d_pivot_time: dIso, timeframe: cfg.timeframe, conf: comp.conf, grade: comp.grade, rr: comp.rr,
              status: "pending",
              notes: `HARM ${comp.name} ${comp.bullish ? "BULL" : "BEAR"} conf${comp.conf}`,
            });
            newSignals++;
            log(`📐 NEW ${comp.name} ${pair.symbol} ${comp.bullish ? "▲" : "▼"} conf ${comp.conf} | entry ${comp.entry}`);
          } catch {}
        }));
        if (bi + BATCH < pairs.length) await new Promise(r => setTimeout(r, 250));
      }
      setLastScanAt(new Date().toISOString());
      log(`🔍 Scan complet: ${scanned} perechi · ${newSignals} semnale noi`);
      await refreshLists(user);
    } catch (err) {
      console.warn("Harmonic scan skipped:", err?.message || err);
    } finally {
      harmonicScanRunning = false;
      setHarmonicRunning(false);
    }
  }, [log, refreshLists]);

  // === MONITOR: trigger entries in PRZ + direction-aware SL/TP exits ===
  const checkHarmonicMonitor = useCallback(async () => {
    if (harmonicMonitorRunning) return;
    harmonicMonitorRunning = true;
    try {
      const cfg = cfgRef.current;
      const user = await base44.auth.me().catch(() => null);
      if (!user) return;
      const [pending, openAll] = await Promise.all([
        base44.entities.HarmonicSignal.filter({ created_by: user.email, status: "pending" }, "-created_date", 200).catch(() => []),
        base44.entities.PaperTrade.filter({ created_by: user.email, status: "open" }, "-created_date", 200).catch(() => []),
      ]);
      const harmonicOpenList = openAll.filter(isHarmonic);
      activityRef.current = pending.length > 0 || harmonicOpenList.length > 0;
      const openSymbols = new Set(openAll.map(t => t.symbol));

      const symSet = new Set();
      pending.forEach(s => symSet.add(s.symbol));
      harmonicOpenList.forEach(t => symSet.add(t.symbol));
      const fapiBase = cfg.marketSource !== "spot" ? "https://fapi.binance.com/fapi/v1" : "https://api.binance.com/api/v3";
      const priceMap = {};
      await Promise.all([...symSet].map(async (sym) => {
        try {
          const r = await fetch(`${fapiBase}/ticker/price?symbol=${sym}`);
          const d = await r.json();
          if (d.price) priceMap[sym] = parseFloat(d.price);
        } catch {}
      }));

      let changed = false;
      let currentOpen = harmonicOpenList.length;

      // 1) Exits (direction-aware)
      for (const trade of harmonicOpenList) {
        const cur = priceMap[trade.symbol];
        if (!cur || !trade.entry_price) continue;
        const isBuy = trade.side === "BUY";
        const pnlPct = isBuy
          ? ((cur - trade.entry_price) / trade.entry_price) * 100
          : ((trade.entry_price - cur) / trade.entry_price) * 100;
        const slHit = isBuy ? cur <= trade.stop_loss : cur >= trade.stop_loss;
        const tpHit = isBuy ? cur >= trade.take_profit : cur <= trade.take_profit;
        if (slHit || tpHit) {
          const pnlUsd = isBuy ? (cur - trade.entry_price) * trade.quantity : (trade.entry_price - cur) * trade.quantity;
          await base44.entities.PaperTrade.update(trade.id, {
            status: "closed", exit_price: cur,
            pnl_percent: Math.round(pnlPct * 100) / 100,
            pnl_usd: Math.round(pnlUsd * 100) / 100,
            exit_reason: slHit ? "stop_loss" : "take_profit",
          });
          realizedPnLRef.current += pnlUsd;
          currentOpen--;
          log(`${slHit ? "🔴 SL HIT" : "🟢 TP HIT"} ${trade.symbol} @ ${cur} | ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`);
          changed = true;
        }
      }

      // 2) Entries + invalidation for pending signals
      const lockedCapital = openAll.reduce((s, t) => s + (t.entry_price || 0) * (t.quantity || 0), 0);
      let availableBalance = (cfg.initialBalance || 10000) + realizedPnLRef.current - lockedCapital;

      for (const sig of pending) {
        const cur = priceMap[sig.symbol];
        if (!cur) continue;
        const invalidated = sig.side === "BUY" ? cur <= sig.sl : cur >= sig.sl;
        if (invalidated) {
          await base44.entities.HarmonicSignal.update(sig.id, { status: "invalidated" });
          log(`⚫ INVALID ${sig.pattern_name} ${sig.symbol} (SL atins înainte de intrare)`);
          changed = true;
          continue;
        }
        const inZone = cur >= sig.prz_bottom && cur <= sig.prz_top;
        if (inZone && !openSymbols.has(sig.symbol) && currentOpen < (cfg.maxOpenTrades ?? 5) && availableBalance >= (cfg.tradeSize ?? 200)) {
          const tpKey = cfg.exitTP || "tp2";
          const tpLevel = sig[tpKey] ?? sig.tp2;
          const quantity = Math.floor((cfg.tradeSize / cur) * 1000) / 1000;
          if (quantity <= 0) continue;
          await base44.entities.PaperTrade.create({
            symbol: sig.symbol, side: sig.side, status: "open",
            entry_price: cur, quantity, stop_loss: sig.sl, take_profit: tpLevel,
            pump_score_at_entry: sig.conf,
            notes: `HARM ${sig.pattern_name} ${sig.side} conf${sig.conf} TF:${sig.timeframe} D:${sig.d_pivot_time}`,
          });
          await base44.entities.HarmonicSignal.update(sig.id, { status: "triggered" });
          openSymbols.add(sig.symbol);
          currentOpen++;
          availableBalance -= (cfg.tradeSize ?? 200); // scade capitalul alocat, altfel balanța nu se actualizează și se deschid tranzacții peste capital
          log(`✅ OPEN ${sig.side} ${sig.symbol} @ ${cur} | ${sig.pattern_name} conf${sig.conf} | SL ${sig.sl} TP ${tpLevel}`);
          changed = true;
        }
      }

      if (changed) {
        queryClient.invalidateQueries({ queryKey: ["paper-trades"] });
        await refreshLists(user);
      }
    } catch (err) {
      console.warn("Harmonic monitor skipped:", err?.message || err);
    } finally {
      harmonicMonitorRunning = false;
    }
  }, [log, refreshLists, queryClient]);

  // Monitor loop - always on (protects open harmonic positions even when scan disabled)
  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      await checkHarmonicMonitor();
      const intervalMs = activityRef.current ? 15000 : 30000;
      monitorTimerRef.current = setTimeout(loop, intervalMs);
    };
    loop();
    return () => { cancelled = true; clearTimeout(monitorTimerRef.current); };
  }, [checkHarmonicMonitor]);

  // Scan loop - only when enabled
  const runScanRef = useRef(runHarmonicScan);
  useEffect(() => { runScanRef.current = runHarmonicScan; }, [runHarmonicScan]);
  useEffect(() => {
    if (!harmonicEnabled) { clearTimeout(scanTimerRef.current); return; }
    runScanRef.current();
    const scheduleNext = () => {
      const intervalMs = (cfgRef.current.scanIntervalMinutes || 5) * 60000;
      scanTimerRef.current = setTimeout(() => { runScanRef.current(); scheduleNext(); }, intervalMs);
    };
    scheduleNext();
    return () => clearTimeout(scanTimerRef.current);
  }, [harmonicEnabled]);

  return (
    <HarmonicBotContext.Provider value={{
      harmonicEnabled, setHarmonicEnabled, harmonicConfig, setHarmonicConfig,
      harmonicLog, harmonicRunning, pendingSignals, harmonicOpen, harmonicClosed,
      lastScanAt, runHarmonicScan, refreshLists,
    }}>
      {children}
    </HarmonicBotContext.Provider>
  );
}

export function useHarmonicBot() {
  const ctx = useContext(HarmonicBotContext);
  if (!ctx) throw new Error("useHarmonicBot must be used within HarmonicBotProvider");
  return ctx;
}