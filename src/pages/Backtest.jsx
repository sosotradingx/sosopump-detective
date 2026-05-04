import React, { useState, useRef, useCallback } from "react";
import { fetchPerpetualPairs, fetchKlines, formatPrice, formatVolume } from "../components/scanner/binanceApi";
import { analyzePump } from "../components/scanner/pumpEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart2, Play, Square, TrendingUp, TrendingDown, Target, AlertCircle } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

const DEFAULT_CONFIG = {
  timeframe: "1h",
  minScore: 50,
  stopLossPct: 5,
  takeProfitPct: 30,
  volumeMultiplier: 2.5,
  adxThreshold: 20,
  exhaustionRsi: 75,
  useTrendFilter: true,
  noiseFilter: true,
  useMacd: true,
  useBbSqueeze: true,
  useAdx: true,
  useObv: true,
  useVolAccum: true,
  scanPairs: 20,
  lookbackDays: 30,
  usePartialTP: false,
  partialTPTarget: 10,
  partialTPPercent: 50,
  moveSlToBreakeven: true,
};

const TF_BARS = { "15m": 2880, "30m": 1440, "1h": 720, "4h": 180, "1d": 30 };

function StatCard({ label, value, sub, color = "text-foreground" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs font-mono text-muted-foreground uppercase">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function runBacktest(klines, cfg) {
  const trades = [];
  const totalBars = klines.length;
  const warmup = 60; // minimum bars before we start scanning

  let openTrade = null;

  for (let i = warmup; i < totalBars; i++) {
    const slice = klines.slice(0, i + 1);
    const bar = { ...klines[i] };

    // Check exit first if in trade
    if (openTrade) {
      const high = bar.high;
      const low = bar.low;
      let exitPrice = null;
      let exitReason = null;

      // --- Partial TP1 check ---
      if (cfg.usePartialTP && !openTrade.partialTPHit) {
        const tp1Price = openTrade.entryPrice * (1 + (cfg.partialTPTarget ?? 10) / 100);
        if (high >= tp1Price) {
          const partialPct = ((tp1Price - openTrade.entryPrice) / openTrade.entryPrice) * 100;
          const remainWeight = (100 - (cfg.partialTPPercent ?? 50)) / 100;
          const soldWeight = (cfg.partialTPPercent ?? 50) / 100;

          // Record partial close trade
          trades.push({
            ...openTrade,
            exitBar: i,
            exitTime: bar.time,
            exitPrice: tp1Price,
            exitReason: "partial_tp",
            pnlPct: Math.round(partialPct * 100) / 100,        // P&L real al prețului
            pnlPctWeighted: Math.round(partialPct * soldWeight * 100) / 100, // pentru equity
            barsHeld: i - openTrade.entryBar,
            isPartial: true,
            partialWeight: soldWeight,
          });

          // Update remaining trade
          openTrade = {
            ...openTrade,
            partialTPHit: true,
            stopLoss: cfg.moveSlToBreakeven ? openTrade.entryPrice : openTrade.stopLoss,
            remainWeight,
          };
          continue;
        }
      }

      if (high >= openTrade.takeProfit) {
        exitPrice = openTrade.takeProfit;
        exitReason = "take_profit";
      } else if (low <= openTrade.stopLoss) {
        exitPrice = openTrade.stopLoss;
        exitReason = "stop_loss";
      }

      if (exitPrice) {
        const rawPnlPct = ((exitPrice - openTrade.entryPrice) / openTrade.entryPrice) * 100;
        const weight = openTrade.remainWeight ?? 1;
        trades.push({
          ...openTrade,
          exitBar: i,
          exitTime: bar.time,
          exitPrice,
          exitReason,
          pnlPct: Math.round(rawPnlPct * 100) / 100,          // P&L real afișat
          pnlPctWeighted: Math.round(rawPnlPct * weight * 100) / 100, // pentru equity
          barsHeld: i - openTrade.entryBar,
        });
        openTrade = null;
      }
      continue; // one trade at a time
    }

    // Scan for entry
    const analysis = analyzePump(slice, {
      volume_multiplier: cfg.volumeMultiplier,
      adx_threshold: cfg.adxThreshold,
      exhaustion_rsi: cfg.exhaustionRsi,
      use_trend_filter: cfg.useTrendFilter,
      noise_filter: cfg.noiseFilter,
      use_macd_confirmation: cfg.useMacd,
      use_bb_squeeze: cfg.useBbSqueeze,
      use_adx_filter: cfg.useAdx,
      use_obv_divergence: cfg.useObv,
      use_volume_accumulation: cfg.useVolAccum,
    });

    if (analysis.totalScore >= cfg.minScore) {
      const price = bar.close;
      const pf = price < 0.001 ? 1e10 : price < 0.01 ? 1e8 : price < 1 ? 1e6 : 1e4;
      openTrade = {
        entryBar: i,
        entryTime: bar.time,
        entryPrice: price,
        stopLoss: Math.round(price * (1 - cfg.stopLossPct / 100) * pf) / pf,
        takeProfit: Math.round(price * (1 + cfg.takeProfitPct / 100) * pf) / pf,
        score: analysis.totalScore,
        pumpStatus: analysis.pumpStatus,
      };
    }
  }

  // Close any remaining open trade at last bar price
  if (openTrade) {
    const lastBar = klines[totalBars - 1];
    const pnlPct = ((lastBar.close - openTrade.entryPrice) / openTrade.entryPrice) * 100;
    trades.push({
      ...openTrade,
      exitBar: totalBars - 1,
      exitTime: lastBar.time,
      exitPrice: lastBar.close,
      exitReason: "timeout",
      pnlPct: Math.round(pnlPct * 100) / 100,
      barsHeld: totalBars - 1 - openTrade.entryBar,
    });
  }

  return trades;
}

export default function Backtest() {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [results, setResults] = useState(null);
  const abortRef = useRef(false);

  const set = (k, v) => setCfg(prev => ({ ...prev, [k]: v }));

  const runBacktestAll = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setResults(null);
    setProgress(0);

    const pairs = await fetchPerpetualPairs(cfg.scanPairs, 1000000);
    const totalBars = TF_BARS[cfg.timeframe] || 720;
    const allTrades = [];
    const symbolResults = [];

    for (let i = 0; i < pairs.length; i++) {
      if (abortRef.current) break;
      const pair = pairs[i];
      setProgressLabel(`Analizez ${pair.symbol} (${i + 1}/${pairs.length})`);
      setProgress(Math.round(((i + 1) / pairs.length) * 100));

      const klines = await fetchKlines(pair.symbol, cfg.timeframe, Math.min(totalBars, 1000), true);
      if (klines.length < 60) continue;

      const trades = runBacktest(klines, cfg);
      if (trades.length === 0) continue;

      const wins = trades.filter(t => t.pnlPct > 0).length;
      const totalPnl = trades.reduce((s, t) => s + t.pnlPct, 0);
      symbolResults.push({
        symbol: pair.symbol,
        trades: trades.length,
        wins,
        losses: trades.length - wins,
        winRate: Math.round((wins / trades.length) * 100),
        totalPnl: Math.round(totalPnl * 100) / 100,
        avgPnl: Math.round((totalPnl / trades.length) * 100) / 100,
      });
      allTrades.push(...trades.map(t => ({ ...t, symbol: pair.symbol })));

      await new Promise(r => setTimeout(r, 80));
    }

    // Build equity curve
    const sortedTrades = allTrades.sort((a, b) => (a.entryTime || 0) - (b.entryTime || 0));
    let equity = 1000;
    const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" }) : "";
    const equityCurve = [{ date: "", equity }];
    sortedTrades.forEach((t) => {
      const effectivePnl = t.pnlPctWeighted ?? t.pnlPct;
      equity *= 1 + effectivePnl / 100;
      equityCurve.push({ date: fmtDate(t.exitTime), equity: Math.round(equity * 100) / 100 });
    });

    const totalTrades = allTrades.length;
    const eff = t => t.pnlPctWeighted ?? t.pnlPct;
    const wins = allTrades.filter(t => eff(t) > 0).length;
    const losses = allTrades.filter(t => eff(t) < 0).length;
    const avgPnl = totalTrades > 0 ? allTrades.reduce((s, t) => s + eff(t), 0) / totalTrades : 0;
    // Real portfolio return based on compounded equity curve
    const totalPnl = ((equity - 1000) / 1000) * 100;
    const maxWin = totalTrades > 0 ? Math.max(...allTrades.map(t => eff(t))) : 0;
    const maxLoss = totalTrades > 0 ? Math.min(...allTrades.map(t => eff(t))) : 0;
    const profitFactor = losses > 0
      ? Math.abs(allTrades.filter(t => eff(t) > 0).reduce((s, t) => s + eff(t), 0) /
          allTrades.filter(t => eff(t) <= 0).reduce((s, t) => s + eff(t), 0))
      : Infinity;

    setResults({
      totalTrades,
      wins,
      losses,
      winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0,
      totalPnl: Math.round(totalPnl * 100) / 100,
      avgPnl: Math.round(avgPnl * 100) / 100,
      maxWin: Math.round(maxWin * 100) / 100,
      maxLoss: Math.round(maxLoss * 100) / 100,
      profitFactor: isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : "∞",
      finalEquity: Math.round(equity * 100) / 100,
      equityCurve,
      symbolResults: symbolResults.sort((a, b) => b.totalPnl - a.totalPnl),
      allTrades: sortedTrades.slice(0, 200),
    });

    setRunning(false);
    setProgress(100);
  }, [cfg]);

  const ToggleRow = ({ label, k }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <Label className="text-xs">{label}</Label>
      <Switch checked={cfg[k] ?? true} onCheckedChange={v => set(k, v)} />
    </div>
  );

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">🧪 Backtesting</h1>
          <p className="text-sm text-muted-foreground">Simulare strategie pump pe date istorice Binance Futures</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Config Panel */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-5 h-fit">
          <h2 className="text-sm font-semibold font-mono text-muted-foreground uppercase">⚙️ Configurare</h2>

          <section className="space-y-3">
            <p className="text-xs text-muted-foreground font-mono border-b border-border pb-1">📊 Parametri Scanare</p>

            <div>
              <Label className="text-xs text-muted-foreground">Timeframe</Label>
              <Select value={cfg.timeframe} onValueChange={v => set("timeframe", v)}>
                <SelectTrigger className="bg-secondary mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">15 minute (~30 zile)</SelectItem>
                  <SelectItem value="30m">30 minute (~30 zile)</SelectItem>
                  <SelectItem value="1h">1 oră (~30 zile)</SelectItem>
                  <SelectItem value="4h">4 ore (~30 zile)</SelectItem>
                  <SelectItem value="1d">1 zi (~30 zile)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Perechi Testate (Top N după volum)</Label>
              <Select value={String(cfg.scanPairs)} onValueChange={v => set("scanPairs", Number(v))}>
                <SelectTrigger className="bg-secondary mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10 (rapid)</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100 (lent)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Scor Minim</Label>
                <Input type="number" min="10" max="100" step="5" value={cfg.minScore}
                  onChange={e => set("minScore", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Vol. Multiplier</Label>
                <Input type="number" min="1" max="10" step="0.5" value={cfg.volumeMultiplier}
                  onChange={e => set("volumeMultiplier", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Stop Loss %</Label>
                <Input type="number" min="0.5" max="20" step="0.5" value={cfg.stopLossPct}
                  onChange={e => set("stopLossPct", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Take Profit %</Label>
                <Input type="number" min="1" max="200" step="1" value={cfg.takeProfitPct}
                  onChange={e => set("takeProfitPct", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">ADX Prag</Label>
                <Input type="number" min="10" max="50" step="5" value={cfg.adxThreshold}
                  onChange={e => set("adxThreshold", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">RSI Exhaustion</Label>
                <Input type="number" min="60" max="95" step="5" value={cfg.exhaustionRsi}
                  onChange={e => set("exhaustionRsi", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs text-muted-foreground font-mono border-b border-border pb-1">🎯 Partial Take-Profit (TP1)</p>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Activează Partial TP</Label>
              <Switch checked={cfg.usePartialTP ?? false} onCheckedChange={v => set("usePartialTP", v)} />
            </div>
            {cfg.usePartialTP && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Target TP1 (%)</Label>
                    <Input type="number" min="1" max="100" step="1" value={cfg.partialTPTarget ?? 10}
                      onChange={e => set("partialTPTarget", Number(e.target.value))} className="bg-secondary mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">% Cantitate Vândută</Label>
                    <Input type="number" min="10" max="90" step="5" value={cfg.partialTPPercent ?? 50}
                      onChange={e => set("partialTPPercent", Number(e.target.value))} className="bg-secondary mt-1" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mută SL la Breakeven după TP1</Label>
                  <Switch checked={cfg.moveSlToBreakeven ?? true} onCheckedChange={v => set("moveSlToBreakeven", v)} />
                </div>
                <p className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded p-2">
                  La TP1 (+{cfg.partialTPTarget}%) se vinde {cfg.partialTPPercent}% din poziție. Restul de {100 - cfg.partialTPPercent}% continuă spre TP2{cfg.moveSlToBreakeven ? " cu SL mutat la breakeven" : ""}.
                </p>
              </>
            )}
          </section>

          <section className="space-y-1">
            <p className="text-xs text-muted-foreground font-mono border-b border-border pb-1">🔬 Filtre Indicatori</p>
            <ToggleRow label="Trend Filter (EMA200)" k="useTrendFilter" />
            <ToggleRow label="Noise Filter (ATR)" k="noiseFilter" />
            <ToggleRow label="MACD Confirmation" k="useMacd" />
            <ToggleRow label="BB Squeeze" k="useBbSqueeze" />
            <ToggleRow label="ADX Filter" k="useAdx" />
            <ToggleRow label="OBV Divergence" k="useObv" />
            <ToggleRow label="Volume Accumulation" k="useVolAccum" />
          </section>

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-primary"
              onClick={runBacktestAll}
              disabled={running}
            >
              {running ? <Square className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {running ? "Rulează..." : "Rulează Backtest"}
            </Button>
            {running && (
              <Button variant="outline" onClick={() => { abortRef.current = true; setRunning(false); }}>
                Stop
              </Button>
            )}
          </div>

          {running && (
            <div className="space-y-1">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground font-mono">{progressLabel}</p>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="space-y-5">
          {!results && !running && (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <BarChart2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">Configurează parametrii și apasă <strong>Rulează Backtest</strong></p>
              <p className="text-xs text-muted-foreground mt-1">Simularea va rula pe ultimele ~30 zile de date reale Binance Futures</p>
            </div>
          )}

          {results && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Total Trades" value={results.totalTrades} sub={`${results.wins}W / ${results.losses}L`} />
                <StatCard
                  label="Win Rate"
                  value={`${results.winRate}%`}
                  color={results.winRate >= 50 ? "text-chart-green" : "text-chart-red"}
                />
                <StatCard
                  label="P&L Mediu / Trade"
                  value={`${results.avgPnl >= 0 ? "+" : ""}${results.avgPnl}%`}
                  color={results.avgPnl >= 0 ? "text-chart-green" : "text-chart-red"}
                />
                <StatCard
                  label="Profit Factor"
                  value={results.profitFactor}
                  color={results.profitFactor === "∞" || results.profitFactor >= 1.5 ? "text-chart-green" : results.profitFactor >= 1 ? "text-pump-active" : "text-chart-red"}
                />
                <StatCard
                  label="Capital Final"
                  value={`$${results.finalEquity}`}
                  sub="pornind de la $1000"
                  color={results.finalEquity >= 1000 ? "text-chart-green" : "text-chart-red"}
                />
                <StatCard
                  label="Max Win"
                  value={`+${results.maxWin}%`}
                  color="text-chart-green"
                />
                <StatCard
                  label="Max Loss"
                  value={`${results.maxLoss}%`}
                  color="text-chart-red"
                />
                <StatCard
                  label="P&L Total"
                  value={`${results.totalPnl >= 0 ? "+" : ""}${results.totalPnl}%`}
                  color={results.totalPnl >= 0 ? "text-chart-green" : "text-chart-red"}
                />
              </div>

              {/* Equity Curve */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3">📈 Curba de Echitate</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={results.equityCurve}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} width={60} />
                    <Tooltip formatter={(v) => [`$${v}`, "Echitate"]} />
                    <ReferenceLine y={1000} stroke="#666" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="equity" stroke="#4CAF50" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Per Symbol Results */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h3 className="text-sm font-semibold">🏆 Rezultate pe Perechi ({results.symbolResults.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left p-3">Pereche</th>
                        <th className="text-center p-3">Trades</th>
                        <th className="text-center p-3">Win Rate</th>
                        <th className="text-right p-3">P&L Mediu</th>
                        <th className="text-right p-3">P&L Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.symbolResults.map(r => (
                        <tr key={r.symbol} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="p-3 font-mono font-semibold text-xs">{r.symbol}</td>
                          <td className="p-3 text-center text-xs">{r.trades} <span className="text-muted-foreground">({r.wins}W/{r.losses}L)</span></td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold ${r.winRate >= 50 ? "text-chart-green" : "text-chart-red"}`}>
                              {r.winRate}%
                            </span>
                          </td>
                          <td className={`p-3 text-right text-xs font-mono ${r.avgPnl >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                            {r.avgPnl >= 0 ? "+" : ""}{r.avgPnl}%
                          </td>
                          <td className={`p-3 text-right text-xs font-mono font-bold ${r.totalPnl >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                            {r.totalPnl >= 0 ? "+" : ""}{r.totalPnl}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Trade Log */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h3 className="text-sm font-semibold">📜 Log Tranzacții (max 200)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left p-2">Pereche</th>
                        <th className="text-center p-2">Score</th>
                        <th className="text-left p-2">Dată Intrare</th>
                        <th className="text-left p-2">Dată Ieșire</th>
                        <th className="text-right p-2">Intrare $</th>
                        <th className="text-right p-2">Ieșire $</th>
                        <th className="text-center p-2">Motiv</th>
                        <th className="text-right p-2">P&L</th>
                        <th className="text-center p-2">Bare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.allTrades.map((t, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-accent/10">
                          <td className="p-2 font-mono">{t.symbol}</td>
                          <td className="p-2 text-center">
                            <span className={`px-1 rounded text-[10px] font-bold ${t.score >= 70 ? "text-pump-strong" : t.score >= 50 ? "text-pump-active" : "text-muted-foreground"}`}>
                              {t.score}
                            </span>
                          </td>
                          <td className="p-2 text-left font-mono text-muted-foreground">{t.entryTime ? new Date(t.entryTime).toLocaleDateString("ro-RO", { day:"2-digit", month:"2-digit", year:"2-digit" }) : "—"}</td>
                          <td className="p-2 text-left font-mono text-muted-foreground">{t.exitTime ? new Date(t.exitTime).toLocaleDateString("ro-RO", { day:"2-digit", month:"2-digit", year:"2-digit" }) : "—"}</td>
                          <td className="p-2 text-right font-mono">${formatPrice(t.entryPrice)}</td>
                          <td className="p-2 text-right font-mono">${formatPrice(t.exitPrice)}</td>
                          <td className="p-2 text-center">
                            <Badge variant="outline" className="text-[9px] px-1">
                              {t.exitReason === "take_profit" ? "✅ TP" : t.exitReason === "stop_loss" ? "❌ SL" : t.exitReason === "partial_tp" ? "🎯 TP1" : "⏱ TO"}
                            </Badge>
                          </td>
                          <td className={`p-2 text-right font-mono font-bold ${t.pnlPct >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                            {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct}%
                          </td>
                          <td className="p-2 text-center text-muted-foreground">{t.barsHeld}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}