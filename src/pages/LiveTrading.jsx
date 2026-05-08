import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Zap, TrendingUp, TrendingDown, RefreshCw, AlertTriangle, DollarSign, Activity, Loader2, X } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import PlanGate from "@/components/PlanGate";
import { getAccountBalance, placeOrder, cancelOrder, getOpenOrders } from "@/components/live-trading/BinanceBrowserApi";

export default function LiveTrading() {
  const { isPro, loading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [botLog, setBotLog] = useState("");
  const [activeKey, setActiveKey] = useState(null);
  const [orderDialog, setOrderDialog] = useState(false);
  const [orderParams, setOrderParams] = useState({
    symbol: "BTCUSDT",
    side: "BUY",
    quantity: 0.01,
    price: 0,
  });
  const [placingOrder, setPlacingOrder] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["userApiKeys", user?.email],
    queryFn: () => base44.entities.UserApiKey.filter({ created_by: user.email, is_active: true }),
    enabled: !!user,
  });

  useEffect(() => {
    if (apiKeys.length > 0) setActiveKey(apiKeys[0]);
  }, [apiKeys]);

  const { data: trades = [] } = useQuery({
    queryKey: ["liveTrades", user?.email],
    queryFn: () => base44.entities.LiveTrade.filter({ created_by: user.email }, "-created_date", 50),
    refetchInterval: 15000,
    enabled: !!user,
  });

  const fetchBalance = useCallback(async () => {
    if (!activeKey || !user) return;
    setLoadingBalance(true);
    try {
      // Decrypt API secret from backend and fetch balance
      const decrypted = await base44.functions.invoke("decryptApiSecret", { keyId: activeKey.id });
      const accountData = await getAccountBalance(activeKey.api_key, decrypted.data.secret);
      
      const totalWallet = accountData.totalWalletBalance ? parseFloat(accountData.totalWalletBalance) : 0;
      const availableBalance = accountData.availableBalance ? parseFloat(accountData.availableBalance) : 0;
      
      setBalance({ totalWallet, availableBalance });
      
      // Log to database
      await base44.entities.LiveTrade.create({
        symbol: "BALANCE_CHECK",
        side: "BUY",
        status: "closed",
        entry_price: availableBalance,
        exit_price: totalWallet,
        quantity: 1,
        notes: `Balance check at ${new Date().toLocaleString("ro-RO")}`,
      });
    } catch (e) {
      console.error("Balance fetch error:", e);
      setBotLog(`❌ Balance error: ${e.message}`);
    }
    setLoadingBalance(false);
  }, [activeKey, user]);

  useEffect(() => {
    if (activeKey) fetchBalance();
    const interval = setInterval(() => fetchBalance(), 30000);
    return () => clearInterval(interval);
  }, [activeKey, fetchBalance]);

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!activeKey || !user) throw new Error("No API key");
      
      setPlacingOrder(true);
      try {
        // Decrypt API secret
        const decrypted = await base44.functions.invoke("decryptApiSecret", { keyId: activeKey.id });
        
        const orderRes = await placeOrder(activeKey.api_key, decrypted.data.secret, {
          symbol: orderParams.symbol,
          side: orderParams.side,
          type: "LIMIT",
          timeInForce: "GTC",
          quantity: orderParams.quantity.toString(),
          price: orderParams.price.toString(),
        });

        // Log trade to database
        await base44.entities.LiveTrade.create({
          symbol: orderParams.symbol,
          side: orderParams.side,
          status: "open",
          entry_price: orderParams.price,
          quantity: orderParams.quantity,
          binance_order_id: orderRes.orderId,
          notes: `Placed via browser at ${new Date().toLocaleString("ro-RO")}`,
        });

        setBotLog(`✅ Ordine plasată: ${orderParams.symbol} ${orderParams.side} ${orderParams.quantity}@${orderParams.price}`);
        setOrderDialog(false);
        queryClient.invalidateQueries({ queryKey: ["liveTrades"] });
      } catch (e) {
        setBotLog(`❌ Eroare ordine: ${e.message}`);
      }
      setPlacingOrder(false);
    },
  });

  const openTrades = trades.filter(t => t.status === "open");
  const closedTrades = trades.filter(t => t.status === "closed");
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl_usd || 0), 0);

  if (!subLoading && !isPro) {
    return <PlanGate requiredPlan="pro" feature="Live Trading" />;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">⚡ Live Trading</h1>
            <p className="text-sm text-muted-foreground">Tranzacții reale pe Binance (din browser)</p>
          </div>
        </div>
        {!activeKey && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Lipsă API Key
          </Badge>
        )}
      </div>

      {!activeKey && (
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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchBalance} disabled={loadingBalance || !activeKey}>
                <RefreshCw className={`w-3 h-3 ${loadingBalance ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {balance ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold font-mono">${balance.availableBalance?.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">disponibil · Total: ${balance.totalWallet?.toFixed(2)}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{activeKey ? "Se încarcă..." : "—"}</p>
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

          {/* Place Order */}
          <Dialog open={orderDialog} onOpenChange={setOrderDialog}>
            <DialogTrigger asChild>
              <Button className="w-full bg-primary hover:bg-primary/90">
                <Zap className="w-4 h-4 mr-2" /> Plasează Ordine
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Ordine Nouă</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Pereche</Label>
                  <Input type="text" value={orderParams.symbol} onChange={e => setOrderParams({...orderParams, symbol: e.target.value.toUpperCase()})} placeholder="BTCUSDT" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Side</Label>
                    <Select value={orderParams.side} onValueChange={v => setOrderParams({...orderParams, side: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUY">BUY</SelectItem>
                        <SelectItem value="SELL">SELL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cantitate</Label>
                    <Input type="number" step="0.001" value={orderParams.quantity} onChange={e => setOrderParams({...orderParams, quantity: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>
                <div>
                  <Label>Preț Limit</Label>
                  <Input type="number" step="0.01" value={orderParams.price} onChange={e => setOrderParams({...orderParams, price: parseFloat(e.target.value) || 0})} />
                </div>
                <Button onClick={() => placeOrderMutation.mutate()} disabled={placingOrder || !activeKey} className="w-full bg-pump-strong hover:bg-pump-strong/90">
                  {placingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Plasează
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Log */}
          {botLog && (
            <div className="bg-secondary/50 rounded-lg p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
              {botLog}
            </div>
          )}
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
                    <th className="text-right p-3">P&L %</th>
                    <th className="text-right p-3">P&L $</th>
                  </tr></thead>
                  <tbody>
                    {closedTrades.slice(0, 30).map(t => (
                      <tr key={t.id} className="border-b border-border/40 hover:bg-accent/20">
                        <td className="p-3 font-mono font-bold">{t.symbol}</td>
                        <td className="p-3 text-right font-mono">${t.entry_price?.toFixed(4) || "—"}</td>
                        <td className="p-3 text-right font-mono">${t.exit_price?.toFixed(4) || "—"}</td>
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