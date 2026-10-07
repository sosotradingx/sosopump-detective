import React, { useState, useEffect } from "react";
import { fetchScannerPairs, fetchScannerKlines, fetchScannerOrderBook, getPreferredExchange } from "@/lib/exchanges";
import { formatPrice } from "../components/scanner/binanceApi";
import { analyzePump, microMetrics, scoreSignal, triggerFlags, resolveStatus } from "@/lib/pumpAdvanced";
import { fetchDerivatives, orderBookImbalance, fetchBtcContext } from "@/lib/marketMetrics";
import CandleChart from "../components/chart/CandleChart";
import IndicatorPanel from "../components/chart/IndicatorPanel";
import ScoreBreakdown from "../components/dashboard/ScoreBreakdown";
import AdvancedPanel from "../components/detail/AdvancedPanel";
import { Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATUS_STYLE = {
  STRONG: "bg-pump-strong/20 text-pump-strong",
  ACTIVE: "bg-pump-active/20 text-pump-active",
  EARLY: "bg-pump-early/20 text-pump-early",
  WATCH: "bg-chart-blue/20 text-chart-blue",
  DUMP_RISK: "bg-destructive/20 text-destructive",
  INACTIVE: "bg-secondary text-muted-foreground",
};

export default function PairDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const exchange = urlParams.get("exchange") || getPreferredExchange();
  const [symbol, setSymbol] = useState(urlParams.get("symbol") || "BTCUSDT");
  const [availablePairs, setAvailablePairs] = useState([]);

  const [klines, setKlines] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("1h");
  const [orderBook, setOrderBook] = useState(null);
  const [adv, setAdv] = useState(null);

  useEffect(() => {
    fetchScannerPairs(exchange, 80, 100000).then(pairs => setAvailablePairs(pairs.map(p => p.symbol)));
  }, [exchange]);

  const loadData = async () => {
    setLoading(true);

    const [klPrimary, kl1h, kl5, kl15, kl4, ob, deriv, btcCtx] = await Promise.all([
      timeframe === "1h" ? Promise.resolve(null) : fetchScannerKlines(exchange, symbol, timeframe, 300),
      fetchScannerKlines(exchange, symbol, "1h", 300),
      fetchScannerKlines(exchange, symbol, "5m", 120),
      fetchScannerKlines(exchange, symbol, "15m", 150),
      fetchScannerKlines(exchange, symbol, "4h", 200),
      fetchScannerOrderBook(exchange, symbol, 50),
      fetchDerivatives(exchange, symbol),
      fetchBtcContext((s, tf, l) => fetchScannerKlines(exchange, s, tf, l)),
    ]);

    const kl = timeframe === "1h" ? kl1h : klPrimary;
    setKlines(kl || []);
    setOrderBook(ob);

    const b1h = analyzePump(kl1h);
    const micro1h = microMetrics(kl1h, b1h);
    const base = timeframe === "1h" ? b1h : analyzePump(kl);
    const micro = timeframe === "1h" ? micro1h : microMetrics(kl, base);
    setAnalysis(base);

    const b5 = analyzePump(kl5);
    const b15 = analyzePump(kl15);
    const b4 = analyzePump(kl4);
    const m5 = microMetrics(kl5, b5);
    const m15 = microMetrics(kl15, b15);
    const m4 = microMetrics(kl4, b4);
    const book = orderBookImbalance(ob, kl1h?.length ? kl1h[kl1h.length - 1].close : 0, 2);

    const sig = scoreSignal({ base: b1h, micro: micro1h, deriv, book, btcCtx, breadthPct: null, base4h: b4, micro4h: m4 });
    const t = triggerFlags(m5);
    const c = triggerFlags(m15);
    const st = resolveStatus({
      trigger: t.trigger, confirm: c.confirm, contextOk: sig.contextOk,
      strength: sig.strength, dumpRisk: sig.dumpRisk, baseEarly: !!b1h?.hasEarlyWarning,
    });

    setAdv({
      sig, micro, deriv, book, base,
      mtf: { b5, b15, b4, m5, m15, m4, trigger: t.trigger, confirm: c.confirm },
      status: st.status, emoji: st.emoji,
    });
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, exchange]);

  const lastPrice = klines.length > 0 ? klines[klines.length - 1].close : 0;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="w-44 bg-card font-mono font-bold text-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availablePairs.map(s => (
                    <SelectItem key={s} value={s} className="font-mono">{s.replace("USDT", "")}/USDT</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {adv && (
                <Badge className={STATUS_STYLE[adv.status] || STATUS_STYLE.INACTIVE}>
                  {adv.emoji} {adv.status}
                </Badge>
              )}
              {adv && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  Strength {adv.sig?.strength ?? 0}% · Manip {adv.sig?.manipulation ?? 0}%
                </span>
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
            <CandleChart klines={klines} analysis={analysis} />

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

            {adv && <div className="lg:hidden"><AdvancedPanel {...adv} base={adv.base} /></div>}
          </div>

          <div className="space-y-4">
            {analysis && (
              <>
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-xs font-mono text-muted-foreground">SCOR MOTOR ({timeframe})</p>
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
            {adv && (
              <div className="hidden lg:block">
                <AdvancedPanel {...adv} base={adv.base} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}