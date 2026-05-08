import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, TrendingUp, TrendingDown, RefreshCw, AlertTriangle, DollarSign, Activity } from "lucide-react";

export default function LiveTrading() {
  const queryClient = useQueryClient();
  const [botEnabled, setBotEnabled] = useState(false);
  const [config, setConfig] = useState({
    tradeSize: 50,
    minScore: 60,
    stopLossPct: 5,
    takeProfitPct: 20,
    maxOpenTrades: 3,
    timeframe: "1h",
  });
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [botLog, setBotLog] = useState("");
  const [runningBot, setRunningBot] = useState(false);

  const { data: trades = [] } = useQuery({
    queryKey: ["liveTrades"],
    queryFn: () => base44.entities.LiveTrade.list("-created_date", 50),
    refetchInterval: 15000,
  });

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["userApiKeys"],
    queryFn: () => base44.entities.UserApiKey.filter({ is_active: true }),
  });

  const hasKey = apiKeys.length > 0;
  const activeKey = apiKeys[0];

  const fetchBalance = async () => {
    if (!hasKey) return;
    setLoadingBalance(true);
    try {
      const res = await base44.functions.invoke("binanceLiveTrade", {
        action: "balance",
        market_type: activeKey.market_type || "futures",
      });
      setBalance(res.data);
    } catch (e) {
      console.error(e);
    }
    setLoadingBalance(false);
  };

  useEffect(() => {
    if (hasKey) fetchBalance();
  }, [hasKey]);

  const runBot = async () => {
    setRunningBot(true);
    setBotLog("Se rulează scanarea...");
    try {
      const res = await base44.functions.invoke("liveAutoBot", {
        ...config,
        enabled: true,
      });
      setBotLog(res.data?.log || "Scanare completă.");
      queryClient.invalidateQueries({ queryKey: ["liveTrades"] });
    } catch (e) {
      setBotLog("Eroare: " + e.message);
    }
    setRunningBot(false);
  };

  const openTrades = trades.filter(t => t.status === "open");
  const closedTrades = trades.filter(t => t.status === "closed");
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl_usd || 0), 0);

  const set = (k, v) => setConfig(prev => ({ ...prev, [k]: v }));

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">⚡ Live Trading</h1>
            <p className="text-sm text-muted-foreground">Tranzacții reale pe Binance</p>
          </div>
        </div>
        {!hasKey && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Lipsă API Key
          </Badge>
        )}
      </div>

      {!hasKey && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          ⚠️ Nu ai nicio cheie API activă. Mergi la <strong>API Keys</strong> pentru a adăuga una.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Config Panel */}
        <div className="space-y-4">
          {/* Balance */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-mono text-muted-foreground uppercase">Balanță Binance</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchBalance} disabled={loadingBalance || !hasKey}>
                <RefreshCw className={`w-3 h-3 ${loadingBalance ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {balance ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold font-mono">${parseFloat(balance.availableBalance || balance.balance || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">disponibil · {activeKey?.market_type || "futures"}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{hasKey ? "Se încarcă..." : "—"}</p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Deschise</p>
              <p className="text-xl font-bold text-pump-active">{openTrades.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Închise</p>
              <p className="text-xl font-bold">{closedTrades.length}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">P&L $</p>
              <p className={`text-xl font-bold ${totalPnl >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Bot Config */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-xs font-mono text-muted-foreground uppercase">⚙️ Configurare Bot</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Mărime Trade $</Label>
                <Input type="number" min="10" value={config.tradeSize}
                  onChange={e => set("tradeSize", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Scor Minim</Label>
                <Input type="number" min="30" max="100" value={config.minScore}
                  onChange={e => set("minScore", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Stop Loss %</Label>
                <Input type="number" min="0.5" step="0.5" value={config.stopLossPct}
                  onChange={e => set("stopLossPct", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Take Profit %</Label>
                <Input type="number" min="1" step="1" value={config.takeProfitPct}
                  onChange={e => set("takeProfitPct", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max Trades</Label>
                <Input type="number" min="1" max="20" value={config.maxOpenTrades}
                  onChange={e => set("maxOpenTrades", Number(e.target.value))} className="bg-secondary mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Timeframe</Label>
                <Select value={config.timeframe} onValueChange={v => set("timeframe", v)}>
                  <SelectTrigger className="bg-secondary mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["15m","30m","1h","4h"].map(tf => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full bg-primary" onClick={runBot} disabled={runningBot || !hasKey}>
              {runningBot ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              {runningBot ? "Scanează..." : "Rulează Bot O Dată"}
            </Button>

            {botLog && (
              <div className="bg-secondary/50 rounded-lg p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                {botLog}
              </div>
            )}
          </div>
        </div>

        {/* Trades Panel */}
        <div className="space-y-4">
          {/* Open Trades */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Activity className="w-4 h-4 text-pump-active" />
              <h3 className="text-sm font-semibold">Tranzacții Deschise ({openTrades.length})</h3>
            </div>
            {openTrades.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nicio tranzacție deschisă</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground border-b border-border">
                    <th className="text-left p-3">Pereche</th>
                    <th className="text-center p-3">Side</th>
                    <th className="text-right p-3">Intrare $</th>
                    <th className="text-right p-3">Qty</th>
                    <th className="text-right p-3">SL</th>
                    <th className="text-right p-3">TP</th>
                    <th className="text-center p-3">Score</th>
                  </tr></thead>
                  <tbody>
                    {openTrades.map(t => (
                      <tr key={t.id} className="border-b border-border/40 hover:bg-accent/20">
                        <td className="p-3 font-mono font-bold">{t.symbol}</td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className={t.side === "BUY" ? "text-chart-green" : "text-chart-red"}>{t.side}</Badge>
                        </td>
                        <td className="p-3 text-right font-mono">${t.entry_price?.toFixed(4)}</td>
                        <td className="p-3 text-right font-mono">{t.quantity}</td>
                        <td className="p-3 text-right font-mono text-chart-red">${t.stop_loss?.toFixed(4)}</td>
                        <td className="p-3 text-right font-mono text-chart-green">${t.take_profit?.toFixed(4)}</td>
                        <td className="p-3 text-center">
                          <span className="text-pump-active font-bold">{t.pump_score_at_entry || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Closed Trades */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Istoric Tranzacții ({closedTrades.length})</h3>
            </div>
            {closedTrades.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Niciun istoric</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground border-b border-border">
                    <th className="text-left p-3">Pereche</th>
                    <th className="text-right p-3">Intrare</th>
                    <th className="text-right p-3">Ieșire</th>
                    <th className="text-center p-3">Motiv</th>
                    <th className="text-right p-3">P&L %</th>
                    <th className="text-right p-3">P&L $</th>
                  </tr></thead>
                  <tbody>
                    {closedTrades.map(t => (
                      <tr key={t.id} className="border-b border-border/40 hover:bg-accent/20">
                        <td className="p-3 font-mono font-bold">{t.symbol}</td>
                        <td className="p-3 text-right font-mono">${t.entry_price?.toFixed(4)}</td>
                        <td className="p-3 text-right font-mono">${t.exit_price?.toFixed(4)}</td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="text-[9px]">
                            {t.exit_reason === "take_profit" ? "✅ TP" : t.exit_reason === "stop_loss" ? "❌ SL" : t.exit_reason || "—"}
                          </Badge>
                        </td>
                        <td className={`p-3 text-right font-mono font-bold ${(t.pnl_percent || 0) >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                          {(t.pnl_percent || 0) >= 0 ? "+" : ""}{(t.pnl_percent || 0).toFixed(2)}%
                        </td>
                        <td className={`p-3 text-right font-mono font-bold ${(t.pnl_usd || 0) >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                          {(t.pnl_usd || 0) >= 0 ? "+" : ""}${(t.pnl_usd || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}