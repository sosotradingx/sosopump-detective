import React, { useState, useEffect, useCallback } from "react";
import { getFuturesTradeHistory } from "@/lib/binanceClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { formatPrice } from "@/components/scanner/binanceApi";

export default function TradeHistory({ creds, positions }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterSymbol, setFilterSymbol] = useState("ALL");

  const activeSymbols = positions?.map(p => p.symbol) || [];

  const fetchHistory = useCallback(async () => {
    if (!creds?.apiSecret) return;
    setLoading(true);
    try {
      const data = await getFuturesTradeHistory(creds.apiKey, creds.apiSecret, null, 100);
      if (Array.isArray(data)) setHistory(data);
    } catch (e) {
      console.error("Trade history error:", e.message);
    }
    setLoading(false);
  }, [creds]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const symbols = ["ALL", ...new Set(history.map(t => t.symbol || t.asset).filter(Boolean))];
  const filtered = filterSymbol === "ALL" ? history : history.filter(t => (t.symbol || t.asset) === filterSymbol);

  const totalPnl = filtered.reduce((sum, t) => sum + parseFloat(t.income || t.realizedPnl || 0), 0);

  if (!creds?.apiSecret) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
        Conectează un API Key pentru a vedea istoricul.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Istoric Tranzacții (PnL Realizat)</h3>
          <Badge className={totalPnl >= 0 ? "bg-chart-green/20 text-chart-green border-chart-green/30" : "bg-chart-red/20 text-chart-red border-chart-red/30"}>
            {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} USDC
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterSymbol} onValueChange={setFilterSymbol}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {symbols.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchHistory} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          {loading ? "Se încarcă istoricul..." : "Nicio tranzacție înregistrată."}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Simbol / Asset</th>
                <th className="text-right p-3">PnL</th>
                <th className="text-right p-3">Cumul</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let cum = 0;
                return filtered.map((t, i) => {
                  const pnl = parseFloat(t.income || t.realizedPnl || 0);
                  cum += pnl;
                  const date = new Date(t.time || t.updateTime || Date.now());
                  return (
                    <tr key={i} className="border-b border-border/30 hover:bg-accent/10">
                      <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                        {date.toLocaleDateString("ro-RO")} {date.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-3 font-mono font-semibold">
                        <div>{t.symbol || "—"}</div>
                        {t.asset && t.asset !== t.symbol && (
                          <div className="text-[10px] text-muted-foreground">{t.asset}</div>
                        )}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold ${pnl >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                        <span className="flex items-center justify-end gap-1">
                          {pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-mono ${cum >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                        {cum >= 0 ? "+" : ""}{cum.toFixed(4)}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}