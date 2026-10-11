import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { fetchScannerKlines, fetchScannerOrderBook, exchangeName, getPreferredExchange, setPreferredExchange, buildUniverse } from "@/lib/exchanges";
import { analyzePump, microMetrics, scoreSignal, triggerFlags, resolveStatus, legacyStatus } from "@/lib/pumpAdvanced";
import { fetchDerivatives, orderBookImbalance, fetchBtcContext } from "@/lib/marketMetrics";
import { syncSignals } from "@/lib/signalLog";
import { createLiquidationFeed } from "@/lib/liquidations";
import { pushSignalAlerts } from "@/lib/notify";
import { publishWatchSignals } from "@/lib/watchSignals";
import StatsCard from "@/components/dashboard/StatsCard";
import TopPumpsTable from "@/components/dashboard/TopPumpsTable";
import ScoreBreakdown from "@/components/dashboard/ScoreBreakdown";
import TopSignalCard from "@/components/dashboard/TopSignalCard";
import LiquidationPanel from "@/components/dashboard/LiquidationPanel";
import AlertToggle from "@/components/dashboard/AlertToggle";
import MarketContextCard from "@/components/dashboard/MarketContextCard";
import MoversPanel from "@/components/dashboard/MoversPanel";
import FlowFactorsPanel from "@/components/dashboard/FlowFactorsPanel";
import RiskPanel from "@/components/dashboard/RiskPanel";
import RadarPanel from "@/components/dashboard/RadarPanel";
import { useRiskGuard } from "@/hooks/useRiskGuard";
import { base44 } from "@/api/base44Client";
import { Activity, TrendingUp, Zap, BarChart3, RefreshCw, Loader2, Skull, Eye, ShieldAlert, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEEP_LIMIT = 50;
const SCAN_LIMIT = 200;
const CANDIDATES = 16;

export default function Dashboard() {
  const navigate = useNavigate();
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [topPair, setTopPair] = useState(null);
  const [exchange, setExchange] = useState(getPreferredExchange);
  const [universeInfo, setUniverseInfo] = useState({ scanned: 0, climbers: 0 });
  const [climbers, setClimbers] = useState([]);
  const [marketCtx, setMarketCtx] = useState(null);
  const [logStats, setLogStats] = useState(null);
  const [liq, setLiq] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  const { risk } = useRiskGuard(user?.email);

  const handleExchangeChange = useCallback((id) => {
    setPreferredExchange(id);
    setExchange(id);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Stage 0: doubled universe — top 50 by volume + volume-ranking climbers (top 200)
    const { universe, climbers, scanned } = await buildUniverse(exchange, {
      deepLimit: DEEP_LIMIT, scanLimit: SCAN_LIMIT, minVolume: 1000000, minRankJump: 20,
    });
    const climberSet = new Set(climbers.map(c => c.symbol));
    setUniverseInfo({ scanned, climbers: climbers.length });
    setClimbers(climbers);

    // Stage 1: deep 1h history (300 candles => proper EMA200 warm-up + z-scores)
    const stage1 = [];
    for (let i = 0; i < universe.length; i += 5) {
      const chunk = universe.slice(i, i + 5);
      const res = await Promise.all(chunk.map(async (pair) => {
        const kl = await fetchScannerKlines(exchange, pair.symbol, "1h", 300);
        if (!kl || kl.length < 120) return null;
        const base = analyzePump(kl);
        const micro = microMetrics(kl, base);
        const pre = base.totalScore +
          (micro.volumeZ >= 2 ? 15 : 0) +
          (micro.absorption ? 10 : 0) +
          (micro.seasonalZ >= 1.5 ? 8 : 0);
        return { ...pair, base, micro, pre, isClimber: climberSet.has(pair.symbol) };
      }));
      stage1.push(...res.filter(Boolean));
      if (i + 5 < universe.length) await new Promise(r => setTimeout(r, 250));
    }

    // Market context: BTC alpha + breadth
    const btcCtx = await fetchBtcContext((s, tf, l) => fetchScannerKlines(exchange, s, tf, l));
    const breadthPct = stage1.length ? (stage1.filter(p => p.priceChangePercent > 0).length / stage1.length) * 100 : 0;

    // Stage 2: cascade 5m / 15m / 4h + derivatives + order book for the best candidates
    const candidates = [...stage1].sort((a, b) => b.pre - a.pre).slice(0, CANDIDATES);
    const detailed = [];
    for (let i = 0; i < candidates.length; i += 4) {
      const chunk = candidates.slice(i, i + 4);
      const res = await Promise.all(chunk.map(async (p) => {
        const [kl5, kl15, kl4, deriv, ob] = await Promise.all([
          fetchScannerKlines(exchange, p.symbol, "5m", 120),
          fetchScannerKlines(exchange, p.symbol, "15m", 150),
          fetchScannerKlines(exchange, p.symbol, "4h", 200),
          fetchDerivatives(exchange, p.symbol),
          fetchScannerOrderBook(exchange, p.symbol, 50),
        ]);
        const b5 = analyzePump(kl5);
        const b15 = analyzePump(kl15);
        const b4 = analyzePump(kl4);
        const m5 = microMetrics(kl5, b5);
        const m15 = microMetrics(kl15, b15);
        const m4 = microMetrics(kl4, b4);
        const book = orderBookImbalance(ob, p.price, 2);
        const sig = scoreSignal({ base: p.base, micro: p.micro, deriv, book, btcCtx, breadthPct, base4h: b4, micro4h: m4 });
        const t = triggerFlags(m5);
        const c = triggerFlags(m15);
        const st = resolveStatus({
          trigger: t.trigger, confirm: c.confirm, contextOk: sig.contextOk,
          strength: sig.strength, dumpRisk: sig.dumpRisk, baseEarly: !!p.base?.hasEarlyWarning,
        });
        const reasons = [...sig.dumpFactors, ...sig.manipReasons.slice(0, 2), ...sig.reasons].slice(0, 6).join(" · ");
        return {
          ...p, deriv, book, ob, sig, mtf: { b5, b15, b4, m5, m15, m4, trigger: t.trigger, confirm: c.confirm },
          status: st.status, emoji: st.emoji, strength: sig.strength, manipulation: sig.manipulation, reasons,
        };
      }));
      detailed.push(...res);
      if (i + 4 < candidates.length) await new Promise(r => setTimeout(r, 250));
    }

    const detailedMap = new Map(detailed.map(d => [d.symbol, d]));
    const merged = stage1.map(p => {
      const d = detailedMap.get(p.symbol);
      if (d) return d;
      const l = legacyStatus(p.base);
      return {
        ...p, status: l.status, emoji: l.emoji, strength: p.base.totalScore, manipulation: null,
        reasons: "", mtf: null, deriv: null, book: null, sig: null,
      };
    });

    setPairs(merged);
    setTopPair([...merged].sort((a, b) => (b.strength || 0) - (a.strength || 0))[0] || null);
    setLastUpdate(new Date());
    setMarketCtx({ btcCtx, breadthPct });
    setLoading(false);

    // Signal logging: outcomes (+1h/+4h/+24h), dedupe and cooldown per symbol
    const priceMap = {};
    merged.forEach(p => { priceMap[`${exchange}:${p.symbol}`] = p.price; });
    const signals = detailed
      .filter(d => d.status !== "INACTIVE")
      .map(d => ({
        symbol: d.symbol, exchange, status: d.status, strength: d.strength, manipulation: d.manipulation,
        score: d.base?.totalScore || 0, price: d.price, priceChange24h: d.priceChangePercent, reasons: d.reasons,
      }));
    try {
      const stats = await syncSignals(signals, priceMap);
      if (stats) setLogStats(stats);
    } catch {
      // logging is best-effort: a traffic/RLS limit must never break the scan
    }

    // Alertă instant (sunet + notificare desktop) la semnale puternice noi
    pushSignalAlerts(signals, { exchange });

    // WATCH (doar 5m) → publicat pentru botul de paper trading, ca intrare timpurie
    publishWatchSignals(merged.filter(p => p.status === "WATCH"), exchange);
  }, [exchange]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 120000); // cascadă completă la 2 min
    return () => clearInterval(interval);
  }, [loadData]);

  // Flux de lichidări live: Binance = toată piața, Bybit = perechile scanate
  const liqKey = exchange === "bybit" ? pairs.slice(0, 30).map(p => p.symbol).sort().join(",") : "";
  useEffect(() => {
    setLiq(null);
    return createLiquidationFeed(exchange, liqKey ? liqKey.split(",") : [], setLiq);
  }, [exchange, liqKey]);

  const activePumps = pairs.filter(p => p.status === "STRONG" || p.status === "ACTIVE").length;
  const earlyWarnings = pairs.filter(p => p.status === "EARLY").length;
  const watchList = pairs.filter(p => p.status === "WATCH").length;
  const dumpRisks = pairs.filter(p => p.status === "DUMP_RISK").length;
  const scored = pairs.filter(p => p.base);
  const avgScore = scored.length ? Math.round(scored.reduce((s, p) => s + (p.base?.totalScore || 0), 0) / scored.length) : 0;
  const manipScored = pairs.filter(p => p.manipulation != null);
  const avgManip = manipScored.length ? Math.round(manipScored.reduce((s, p) => s + p.manipulation, 0) / manipScored.length) : 0;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-primary">🔥</span> Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cascadă 5m → 15m → 1h/4h · {exchangeName(exchange)} · univers top {DEEP_LIMIT} + urcări în top {SCAN_LIMIT}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate &&
            <span className="text-xs text-muted-foreground font-mono">
              Actualizat: {lastUpdate.toLocaleTimeString("ro-RO")}
            </span>
          }
          <AlertToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="border-primary/30 text-primary hover:bg-primary/10">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Perechi Scanate"
          value={pairs.length}
          subtitle={`din ${universeInfo.scanned} · ${universeInfo.climbers} urcări`}
          icon={BarChart3}
          color="text-chart-blue" />

        <StatsCard
          title="Pump-uri Active"
          value={activePumps}
          subtitle={activePumps > 0 ? "1h aliniat" : "niciun pump activ"}
          icon={Zap}
          color="text-pump-strong" />

        <StatsCard
          title="Early / Confirmat"
          value={earlyWarnings}
          subtitle="trigger 5m + confirmare 15m"
          icon={Activity}
          color="text-pump-early" />

        <StatsCard
          title="Dump Risk"
          value={dumpRisks}
          subtitle="fază de distribuție"
          icon={Skull}
          color="text-destructive" />

        <StatsCard
          title="Watch (doar 5m)"
          value={watchList}
          subtitle="intrare timpurie în bot"
          icon={Eye}
          color="text-chart-blue" />

        <StatsCard
          title="Scor Mediu 1h"
          value={avgScore + "%"}
          subtitle="motorul clasic"
          icon={TrendingUp}
          color="text-pump-active" />

        <StatsCard
          title="Manipulare Medie"
          value={avgManip + "%"}
          subtitle="lichiditate / OI / CVD"
          icon={ShieldAlert}
          color="text-destructive" />

        <StatsCard
          title="Semnale Logate"
          value={logStats?.open ?? 0}
          subtitle={logStats ? `+${logStats.created} noi · ${logStats.updated} actualizate` : "se actualizează la 10 min"}
          icon={Database}
          color="text-chart-purple" />
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 min-w-0">
          <RadarPanel
            pairs={pairs}
            onSelectSymbol={(symbol) => navigate(createPageUrl("PairDetail") + `?symbol=${symbol}&exchange=${exchange}`)} />
        </div>
        <div className="lg:col-span-2 min-w-0">
          <TopPumpsTable
            data={pairs}
            exchange={exchange}
            onExchangeChange={handleExchangeChange}
            loading={loading}
            liq={liq?.bySymbol}
            onSelectPair={(symbol) => navigate(createPageUrl("PairDetail") + `?symbol=${symbol}&exchange=${exchange}`)} />
        </div>
        <div className="space-y-4 min-w-0">
          <MarketContextCard
            btcCtx={marketCtx?.btcCtx}
            breadthPct={marketCtx?.breadthPct}
            pairs={pairs}
            climbers={climbers}
            onSelectSymbol={(symbol) => navigate(createPageUrl("PairDetail") + `?symbol=${symbol}&exchange=${exchange}`)} />
          <LiquidationPanel liq={liq} exchange={exchange} />
          <RiskPanel risk={risk} item={topPair} />
          {topPair &&
            <>
              <TopSignalCard item={topPair} />
              <FlowFactorsPanel item={topPair} liq={liq} />
              {topPair.base && <ScoreBreakdown analysis={topPair.base} />}
            </>
          }
          <MoversPanel
            pairs={pairs}
            onSelectSymbol={(symbol) => navigate(createPageUrl("PairDetail") + `?symbol=${symbol}&exchange=${exchange}`)} />
        </div>
      </div>
    </div>
  );
}