import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTopPairs, formatPrice, formatVolume } from "../components/scanner/binanceApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, X, Wallet, TrendingUp, TrendingDown, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip } from "recharts";

export default function PaperTrading() {
  const queryClient = useQueryClient();
  const [prices, setPrices] = useState({});
  const [openDialog, setOpenDialog] = useState(false);
  const [newTrade, setNewTrade] = useState({ symbol: "BTCUSDT", quantity: 0.01, stop_loss: 0, take_profit: 0 });

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
  }, []);

  useEffect(() => {
    loadPrices();
    const interval = setInterval(loadPrices, 15000);
    return () => clearInterval(interval);
  }, [loadPrices]);

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

  // Calculate portfolio stats
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">💰 Paper Trading</h1>
          <p className="text-sm text-muted-foreground">Portofoliu virtual · Pump Strategy</p>
        </div>
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
            Nicio poziție deschisă. Folosește Scanner-ul pentru a identifica pump-uri.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-3">Pereche</th>
                  <th className="text-right p-3">Intrare</th>
                  <th className="text-right p-3">Curent</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="text-right p-3">SL / TP</th>
                  <th className="text-center p-3">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map(trade => {
                  const curPrice = prices[trade.symbol] || trade.entry_price;
                  const pnl = ((curPrice - trade.entry_price) / trade.entry_price) * 100;
                  const pnlUsd = (curPrice - trade.entry_price) * trade.quantity;
                  return (
                    <tr key={trade.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="p-3 font-mono font-semibold">{trade.symbol}</td>
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
                  <th className="text-right p-3">Intrare</th>
                  <th className="text-right p-3">Ieșire</th>
                  <th className="text-right p-3">P&L</th>
                  <th className="text-center p-3">Motiv</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.slice(0, 20).map(trade => (
                  <tr key={trade.id} className="border-b border-border/50">
                    <td className="p-3 font-mono text-xs">{trade.symbol}</td>
                    <td className="p-3 text-right font-mono text-xs">${formatPrice(trade.entry_price)}</td>
                    <td className="p-3 text-right font-mono text-xs">${formatPrice(trade.exit_price)}</td>
                    <td className={`p-3 text-right font-mono font-bold text-xs ${(trade.pnl_percent || 0) >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                      {(trade.pnl_percent || 0) >= 0 ? "+" : ""}{(trade.pnl_percent || 0).toFixed(2)}%
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className="text-[10px]">{trade.exit_reason || "manual"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}