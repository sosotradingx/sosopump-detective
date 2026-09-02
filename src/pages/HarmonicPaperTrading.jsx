import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useSubscription } from "@/hooks/useSubscription";
import PlanGate from "@/components/PlanGate";
import { useHarmonicBot } from "@/lib/HarmonicBotContext";
import HarmonicBotSettings from "@/components/harmonicpaper/HarmonicBotSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Hexagon, Settings, Loader2, Activity, ArrowUp, ArrowDown, Clock } from "lucide-react";
import { formatPrice } from "@/components/scanner/binanceApi";

export default function HarmonicPaperTrading() {
  const { isPro, loading: subLoading } = useSubscription();
  const {
    harmonicEnabled, setHarmonicEnabled, harmonicConfig, setHarmonicConfig,
    harmonicLog, harmonicRunning, pendingSignals, harmonicOpen, harmonicClosed,
    lastScanAt, runHarmonicScan,
  } = useHarmonicBot();
  const [showSettings, setShowSettings] = useState(false);
  const [prices, setPrices] = useState({});

  // Live prices for open trades + pending signals
  const loadPrices = useCallback(async () => {
    const symbols = new Set();
    harmonicOpen.forEach(t => symbols.add(t.symbol));
    pendingSignals.forEach(s => symbols.add(s.symbol));
    if (symbols.size === 0) return;
    const isPerp = harmonicConfig.marketSource !== "spot";
    const base = isPerp ? "https://fapi.binance.com/fapi/v1" : "https://api.binance.com/api/v3";
    const map = {};
    await Promise.all([...symbols].map(async (sym) => {
      try {
        const r = await fetch(`${base}/ticker/price?symbol=${sym}`);
        const d = await r.json();
        if (d.price) map[sym] = parseFloat(d.price);
      } catch {}
    }));
    setPrices(map);
  }, [harmonicOpen, pendingSignals, harmonicConfig.marketSource]);

  useEffect(() => {
    loadPrices();
    const i = setInterval(loadPrices, 15000);
    return () => clearInterval(i);
  }, [loadPrices]);

  // Stats (harmonic-only portfolio)
  const realizedPnL = useMemo(() => harmonicClosed.reduce((s, t) => s + (t.pnl_usd || 0), 0), [harmonicClosed]);
  const lockedCapital = useMemo(() => harmonicOpen.reduce((s, t) => s + (t.entry_price || 0) * (t.quantity || 0), 0), [harmonicOpen]);
  const unrealizedPnL = useMemo(() => harmonicOpen.reduce((s, t) => {
    const cur = prices[t.symbol] || t.entry_price;
    const isBuy = t.side === "BUY";
    return s + (isBuy ? (cur - t.entry_price) : (t.entry_price - cur)) * (t.quantity || 0);
  }, 0), [harmonicOpen, prices]);
  const initialBalance = harmonicConfig.initialBalance || 10000;
  const availableBalance = initialBalance + realizedPnL - lockedCapital;
  const totalPortfolio = initialBalance + realizedPnL + unrealizedPnL;

  const last24hClosed = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return harmonicClosed.filter(t => new Date(t.updated_date || t.created_date).getTime() >= cutoff);
  }, [harmonicClosed]);
  const winRate = last24hClosed.length > 0
    ? Math.round((last24hClosed.filter(t => (t.pnl_usd || 0) > 0).length / last24hClosed.length) * 100)
    : 0;

  if (!subLoading && !isPro) {
    return <PlanGate requiredPlan="pro" feature="Harmonic Paper Trading" />;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Hexagon className="w-6 h-6 text-primary" /> Harmonic Paper Trading
          </h1>
          <p className="text-sm text-muted-foreground">Pattern-uri Gartley · Bat · Crab · AB=CD · Butterfl · intrare automată în zona PRZ</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${harmonicEnabled ? "bg-pump-strong/10 border-pump-strong/40" : "bg-secondary border-border"}`}>
            <Hexagon className={`w-4 h-4 ${harmonicEnabled ? "text-pump-strong" : "text-muted-foreground"}`} />
            <span className="text-xs font-mono">Auto-Bot</span>
            <Switch checked={harmonicEnabled} onCheckedChange={setHarmonicEnabled} />
            {harmonicRunning && <Loader2 className="w-3 h-3 animate-spin text-pump-strong" />}
          </div>
          <Button variant="outline" size="sm" onClick={() => runHarmonicScan()} disabled={harmonicRunning}>
            {harmonicRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Activity className="w-4 h-4 mr-1" />}
            Scanează acum
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 mr-1" /> Setări
          </Button>
        </div>
      </div>

      {/* Bot status bar */}
      {harmonicEnabled && (
        <div className="bg-pump-strong/10 border border-pump-strong/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Activity className="w-4 h-4 text-pump-strong" />
            <span className="text-xs font-mono font-semibold text-pump-strong">BOT ACTIV</span>
            <span className="text-xs text-muted-foreground">
              · TF: <span className="text-primary font-mono">{harmonicConfig.timeframe}</span>
              · Sensibilitate: <span className="text-primary font-mono">{harmonicConfig.sensitivity}</span>
              · Conf min: {harmonicConfig.minConf}%
              · Scan: {harmonicConfig.scanIntervalMinutes} min
              · TP: {harmonicConfig.exitTP}
              · Max: {harmonicConfig.maxOpenTrades}
            </span>
            {lastScanAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {new Date(lastScanAt).toLocaleTimeString("ro-RO")}
              </span>
            )}
          </div>
          {harmonicLog.length > 0 && (
            <div className="bg-background/50 rounded-lg p-2 max-h-28 overflow-y-auto space-y-0.5">
              {harmonicLog.map((line, i) => (
                <p key={i} className="text-[10px] font-mono text-muted-foreground">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">DISPONIBIL</p>
          <p className="text-xl font-bold mt-1">${availableBalance.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Total: ${totalPortfolio.toFixed(2)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">ÎN POZIȚII</p>
          <p className="text-xl font-bold mt-1 text-chart-blue">${lockedCapital.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{harmonicOpen.length} deschise</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">P&L REALIZAT</p>
          <p className={`text-xl font-bold mt-1 ${realizedPnL >= 0 ? "text-chart-green" : "text-chart-red"}`}>
            {realizedPnL >= 0 ? "+" : ""}${realizedPnL.toFixed(2)}
          </p>
          <p className={`text-[10px] mt-1 ${unrealizedPnL >= 0 ? "text-chart-green" : "text-chart-red"}`}>
            Nerealizat: {unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toFixed(2)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">WIN RATE (24h)</p>
          <p className={`text-xl font-bold mt-1 ${winRate >= 50 ? "text-chart-green" : "text-chart-red"}`}>{winRate}%</p>
          <p className="text-[10px] text-muted-foreground mt-1">{last24hClosed.length} tranzacții 24h</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-mono text-muted-foreground">SEMALE PENDING</p>
          <p className="text-xl font-bold mt-1 text-chart-gold">{pendingSignals.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1">așteaptă intrare în PRZ</p>
        </div>
      </div>

      {/* Pending signals */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-chart-gold" /> Semnale Pending ({pendingSignals.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Pattern-uri detectate care așteaptă ca prețul să atingă zona de entry (PRZ) pentru a deschide tranzacția.</p>
        </div>
        {pendingSignals.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Niciun semnal pending. {harmonicEnabled ? "Botul scanează patternuri noi..." : "Activează Auto-Bot sau scanează manual."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-3">Pereche</th>
                  <th className="text-left p-3">Pattern</th>
                  <th className="text-center p-3">Direcție</th>
                  <th className="text-right p-3">Zonă Entry (PRZ)</th>
                  <th className="text-right p-3">Preț curent</th>
                  <th className="text-right p-3">SL</th>
                  <th className="text-right p-3">TP</th>
                  <th className="text-center p-3">Conf</th>
                  <th className="text-left p-3">Detectat</th>
                </tr>
              </thead>
              <tbody>
                {pendingSignals.map(sig => {
                  const cur = prices[sig.symbol] || sig.entry;
                  const inZone = cur >= sig.prz_bottom && cur <= sig.prz_top;
                  return (
                    <tr key={sig.id} className={`border-b border-border/50 hover:bg-accent/30 ${inZone ? "bg-pump-strong/5" : ""}`}>
                      <td className="p-3 font-mono font-semibold">{sig.symbol}</td>
                      <td className="p-3"><Badge variant="outline" className="text-[10px]">{sig.pattern_name}</Badge></td>
                      <td className="p-3 text-center">
                        {sig.side === "BUY"
                          ? <span className="text-chart-green flex items-center justify-center"><ArrowUp className="w-3 h-3" /> BUY</span>
                          : <span className="text-chart-red flex items-center justify-center"><ArrowDown className="w-3 h-3" /> SELL</span>}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        <span className="text-chart-gold">${formatPrice(sig.prz_bottom)}</span>
                        {" – "}
                        <span className="text-chart-gold">${formatPrice(sig.prz_top)}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        ${formatPrice(cur)}
                        {inZone && <span className="ml-1 text-[9px] text-pump-strong bg-pump-strong/15 px-1 py-0.5 rounded">ÎN ZONĂ</span>}
                      </td>
                      <td className="p-3 text-right font-mono text-xs text-chart-red">${formatPrice(sig.sl)}</td>
                      <td className="p-3 text-right font-mono text-xs text-chart-green">${formatPrice(sig[harmonicConfig.exitTP] ?? sig.tp2)}</td>
                      <td className="p-3 text-center"><span className="text-xs font-mono">{sig.conf}%</span></td>
                      <td className="p-3 text-xs text-muted-foreground font-mono">
                        {sig.d_pivot_time ? new Date(sig.d_pivot_time).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Open positions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold">📊 Poziții Deschise ({harmonicOpen.length})</h3>
        </div>
        {harmonicOpen.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nicio poziție deschisă.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-3">Pereche</th>
                  <th className="text-center p-3">Direcție</th>
                  <th className="text-left p-3">Pattern</th>
                  <th className="text-right p-3">Intrare</th>
                  <th className="text-right p-3">Curent</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="text-right p-3">SL / TP</th>
                  <th className="text-center p-3">Conf</th>
                  <th className="text-center p-3">Închide</th>
                </tr>
              </thead>
              <tbody>
                {harmonicOpen.map(trade => {
                  const cur = prices[trade.symbol] || trade.entry_price;
                  const isBuy = trade.side === "BUY";
                  const pnl = isBuy ? ((cur - trade.entry_price) / trade.entry_price) * 100 : ((trade.entry_price - cur) / trade.entry_price) * 100;
                  const pnlUsd = isBuy ? (cur - trade.entry_price) * trade.quantity : (trade.entry_price - cur) * trade.quantity;
                  const patMatch = trade.notes?.match(/HARM (\S+)/);
                  const pattern = patMatch ? patMatch[1] : "—";
                  return (
                    <tr key={trade.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="p-3 font-mono font-semibold">
                        {trade.symbol}
                        <span className="ml-1 text-[9px] text-primary bg-primary/10 px-1 py-0.5 rounded">HARM</span>
                      </td>
                      <td className="p-3 text-center">
                        {isBuy
                          ? <span className="text-chart-green flex items-center justify-center"><ArrowUp className="w-3 h-3" />BUY</span>
                          : <span className="text-chart-red flex items-center justify-center"><ArrowDown className="w-3 h-3" />SELL</span>}
                      </td>
                      <td className="p-3"><Badge variant="outline" className="text-[10px]">{pattern}</Badge></td>
                      <td className="p-3 text-right font-mono">${formatPrice(trade.entry_price)}</td>
                      <td className="p-3 text-right font-mono">${formatPrice(cur)}</td>
                      <td className={`p-3 text-right font-mono font-bold ${pnl >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                        <br /><span className="text-xs">${pnlUsd.toFixed(2)}</span>
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        <span className="text-chart-red">${formatPrice(trade.stop_loss)}</span>
                        {" / "}
                        <span className="text-chart-green">${formatPrice(trade.take_profit)}</span>
                      </td>
                      <td className="p-3 text-center text-xs font-mono">{trade.pump_score_at_entry ?? "—"}%</td>
                      <td className="p-3 text-center">
                        <Button variant="destructive" size="sm" onClick={async () => {
                          const pnlUsd2 = isBuy ? (cur - trade.entry_price) * trade.quantity : (trade.entry_price - cur) * trade.quantity;
                          const pnlPct2 = isBuy ? ((cur - trade.entry_price) / trade.entry_price) * 100 : ((trade.entry_price - cur) / trade.entry_price) * 100;
                          await base44.entities.PaperTrade.update(trade.id, {
                            status: "closed", exit_price: cur,
                            pnl_percent: Math.round(pnlPct2 * 100) / 100,
                            pnl_usd: Math.round(pnlUsd2 * 100) / 100,
                            exit_reason: "manual",
                          });
                        }}>
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

      {/* Closed 24h */}
      {last24hClosed.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold">📜 Istoric 24h ({last24hClosed.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-3">Pereche</th>
                  <th className="text-center p-3">Direcție</th>
                  <th className="text-right p-3">Intrare</th>
                  <th className="text-right p-3">Ieșire</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="text-center p-3">Motiv</th>
                </tr>
              </thead>
              <tbody>
                {last24hClosed.slice(0, 50).map(trade => {
                  const isBuy = trade.side === "BUY";
                  return (
                    <tr key={trade.id} className="border-b border-border/50">
                      <td className="p-3 font-mono text-xs font-semibold">{trade.symbol}</td>
                      <td className="p-3 text-center">
                        {isBuy ? <span className="text-chart-green text-xs">▲ BUY</span> : <span className="text-chart-red text-xs">▼ SELL</span>}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">${formatPrice(trade.entry_price)}</td>
                      <td className="p-3 text-right font-mono text-xs">${formatPrice(trade.exit_price)}</td>
                      <td className={`p-3 text-right font-mono font-bold text-xs ${(trade.pnl_percent || 0) >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                        {(trade.pnl_percent || 0) >= 0 ? "+" : ""}{(trade.pnl_percent || 0).toFixed(2)}%
                      </td>
                      <td className="p-3 text-center"><Badge variant="outline" className="text-[10px]">{trade.exit_reason || "manual"}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showSettings && (
        <HarmonicBotSettings config={harmonicConfig} onChange={setHarmonicConfig} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}