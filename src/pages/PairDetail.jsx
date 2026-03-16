import React, { useState, useEffect, useCallback } from "react";
import { fetchKlines, fetchOrderBook, fetchTopPairs, formatPrice, formatVolume } from "../components/scanner/binanceApi";
import { analyzePump } from "../components/scanner/pumpEngine";
import CandleChart from "../components/chart/CandleChart";
import IndicatorPanel from "../components/chart/IndicatorPanel";
import ScoreBreakdown from "../components/dashboard/ScoreBreakdown";
import { Loader2, RefreshCw, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function PairDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const [symbol, setSymbol] = useState(urlParams.get("symbol") || "BTCUSDT");
  const [availablePairs, setAvailablePairs] = useState([]);

  const [klines, setKlines] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("1h");
  const [orderBook, setOrderBook] = useState(null);

  useEffect(() => {
    fetchTopPairs("USDT", 80, 100000).then(pairs => setAvailablePairs(pairs.map(p => p.symbol)));
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [kl, ob] = await Promise.all([
      fetchKlines(symbol, timeframe, 100),
      fetchOrderBook(symbol, 10)
    ]);
    setKlines(kl);
    setOrderBook(ob);
    const a = analyzePump(kl);
    setAnalysis(a);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  const lastPrice = klines.length > 0 ? klines[klines.length - 1].close : 0;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("Scanner")}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{symbol.replace("USDT", "")}</h1>
              <span className="text-muted-foreground">/USDT</span>
              {analysis && (
                <Badge className={`${
                  analysis.pumpStatus === "STRONG" ? "bg-pump-strong/20 text-pump-strong" :
                  analysis.pumpStatus === "ACTIVE" ? "bg-pump-active/20 text-pump-active" :
                  analysis.pumpStatus === "EARLY" ? "bg-pump-early/20 text-pump-early" :
                  "bg-secondary text-muted-foreground"
                }`}>
                  {analysis.pumpEmoji} {analysis.pumpStatus}
                </Badge>
              )}
            </div>
            <p className="text-3xl font-bold font-mono mt-1">
              {formatPrice(lastPrice)}
              {analysis && (
                <span className={`text-sm ml-3 ${analysis.pumpPercent >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                  {analysis.pumpPercent >= 0 ? "+" : ""}{analysis.pumpPercent}%
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-24 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">1m</SelectItem>
              <SelectItem value="5m">5m</SelectItem>
              <SelectItem value="15m">15m</SelectItem>
              <SelectItem value="1h">1h</SelectItem>
              <SelectItem value="4h">4h</SelectItem>
              <SelectItem value="1d">1d</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {loading && !analysis ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <PriceChart klines={klines} analysis={analysis} />
            
            {/* Order Book Mini */}
            {orderBook && (
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-mono text-muted-foreground mb-3">ORDER BOOK</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-mono text-chart-green mb-2">BIDS</p>
                    {orderBook.bids?.slice(0, 5).map((bid, i) => (
                      <div key={i} className="flex justify-between text-xs font-mono py-0.5">
                        <span className="text-chart-green">{formatPrice(parseFloat(bid[0]))}</span>
                        <span className="text-muted-foreground">{parseFloat(bid[1]).toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-chart-red mb-2">ASKS</p>
                    {orderBook.asks?.slice(0, 5).map((ask, i) => (
                      <div key={i} className="flex justify-between text-xs font-mono py-0.5">
                        <span className="text-chart-red">{formatPrice(parseFloat(ask[0]))}</span>
                        <span className="text-muted-foreground">{parseFloat(ask[1]).toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {analysis && (
              <>
                {/* Score display */}
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-xs font-mono text-muted-foreground">PUMP SCORE</p>
                  <p className={`text-5xl font-bold mt-2 ${
                    analysis.totalScore >= 70 ? "text-pump-strong" :
                    analysis.totalScore >= 40 ? "text-pump-active" : "text-muted-foreground"
                  }`}>
                    {analysis.totalScore}
                  </p>
                  <div className="w-full h-2 bg-secondary rounded-full mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        analysis.totalScore >= 70 ? "bg-pump-strong" :
                        analysis.totalScore >= 40 ? "bg-pump-active" : "bg-pump-inactive"
                      }`}
                      style={{ width: `${analysis.totalScore}%` }}
                    />
                  </div>
                </div>
                <ScoreBreakdown analysis={analysis} />
                <IndicatorPanel analysis={analysis} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}