import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { TrendingUp, TrendingDown, BarChart2, PieChart as PieIcon, Activity } from "lucide-react";
import { format } from "date-fns";

const COLORS = ["#26A69A","#EF5350","#2196F3","#FF9800","#9C27B0","#FFD700","#4CAF50","#FF5722","#00BCD4","#E91E63"];

function StatCard({ label, value, sub, color = "text-foreground" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs font-mono text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2 text-xs font-mono shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" ? (p.value >= 0 ? "+" : "") + p.value.toFixed(2) : p.value}</p>
      ))}
    </div>
  );
};

export default function TradingDashboard() {
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ["paper-trades-dashboard"],
    queryFn: () => base44.entities.PaperTrade.list("-created_date", 200),
  });

  const closedTrades = useMemo(() => trades.filter(t => t.status === "closed"), [trades]);
  const openTrades = useMemo(() => trades.filter(t => t.status === "open"), [trades]);

  // --- Equity Curve ---
  const equityCurve = useMemo(() => {
    const initial = 10000;
    let balance = initial;
    const sorted = [...closedTrades].sort((a, b) => new Date(a.updated_date) - new Date(b.updated_date));
    const points = [{ time: "Start", balance: initial, pnl: 0 }];
    sorted.forEach((t, i) => {
      balance += (t.pnl_usd || 0);
      points.push({
        time: format(new Date(t.updated_date || t.created_date), "dd/MM HH:mm"),
        balance: Math.round(balance * 100) / 100,
        pnl: Math.round((t.pnl_usd || 0) * 100) / 100,
        symbol: t.symbol,
        idx: i + 1,
      });
    });
    return points;
  }, [closedTrades]);

  // --- Daily Win Rate ---
  const dailyStats = useMemo(() => {
    const byDay = {};
    closedTrades.forEach(t => {
      const day = format(new Date(t.updated_date || t.created_date), "dd MMM");
      if (!byDay[day]) byDay[day] = { day, wins: 0, losses: 0, pnl: 0, total: 0 };
      byDay[day].total++;
      byDay[day].pnl += (t.pnl_usd || 0);
      if ((t.pnl_usd || 0) > 0) byDay[day].wins++;
      else byDay[day].losses++;
    });
    return Object.values(byDay).map(d => ({
      ...d,
      winRate: d.total > 0 ? Math.round((d.wins / d.total) * 100) : 0,
      pnl: Math.round(d.pnl * 100) / 100,
    }));
  }, [closedTrades]);

  // --- Distribution per pair ---
  const pairDistribution = useMemo(() => {
    const byPair = {};
    closedTrades.forEach(t => {
      const sym = t.symbol.replace("USDT", "");
      if (!byPair[sym]) byPair[sym] = { name: sym, count: 0, pnl: 0 };
      byPair[sym].count++;
      byPair[sym].pnl += (t.pnl_usd || 0);
    });
    return Object.values(byPair)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(p => ({ ...p, pnl: Math.round(p.pnl * 100) / 100 }));
  }, [closedTrades]);

  // --- Exit reason breakdown ---
  const exitReasons = useMemo(() => {
    const counts = {};
    closedTrades.forEach(t => {
      const r = t.exit_reason || "manual";
      counts[r] = (counts[r] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [closedTrades]);

  // --- Summary stats ---
  const totalPnL = closedTrades.reduce((s, t) => s + (t.pnl_usd || 0), 0);
  const winRate = closedTrades.length > 0
    ? Math.round((closedTrades.filter(t => (t.pnl_usd || 0) > 0).length / closedTrades.length) * 100) : 0;
  const avgWin = closedTrades.filter(t => (t.pnl_usd || 0) > 0).reduce((s, t) => s + (t.pnl_usd || 0), 0)
    / (closedTrades.filter(t => (t.pnl_usd || 0) > 0).length || 1);
  const avgLoss = closedTrades.filter(t => (t.pnl_usd || 0) < 0).reduce((s, t) => s + (t.pnl_usd || 0), 0)
    / (closedTrades.filter(t => (t.pnl_usd || 0) < 0).length || 1);
  const finalBalance = 10000 + totalPnL;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" /> Trading Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">Analiză performanță · {closedTrades.length} tranzacții închise · {openTrades.length} deschise</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="BALANȚĂ" value={`$${finalBalance.toFixed(2)}`}
          color={finalBalance >= 10000 ? "text-chart-green" : "text-chart-red"} />
        <StatCard label="P&L TOTAL" value={`${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`}
          sub={`${((totalPnL / 10000) * 100).toFixed(2)}% ROI`}
          color={totalPnL >= 0 ? "text-chart-green" : "text-chart-red"} />
        <StatCard label="WIN RATE" value={`${winRate}%`}
          sub={`${closedTrades.filter(t => (t.pnl_usd || 0) > 0).length}W / ${closedTrades.filter(t => (t.pnl_usd || 0) <= 0).length}L`}
          color={winRate >= 50 ? "text-chart-green" : "text-chart-red"} />
        <StatCard label="AVG WIN" value={`+$${avgWin.toFixed(2)}`} color="text-chart-green" />
        <StatCard label="AVG LOSS" value={`$${avgLoss.toFixed(2)}`} color="text-chart-red" />
      </div>

      {/* Equity Curve */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Equity Curve</h2>
          <span className="text-xs text-muted-foreground ml-auto">{equityCurve.length - 1} trades</span>
        </div>
        {equityCurve.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Niciun trade închis încă
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={equityCurve} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#26A69A" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#26A69A" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#64748b" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#64748b" }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="balance" name="Balanță ($)" stroke="#26A69A" strokeWidth={2}
                fill="url(#balanceGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily Win Rate + PnL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-chart-blue" />
            <h2 className="font-semibold text-sm">Win Rate pe Zile (%)</h2>
          </div>
          {dailyStats.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Fără date</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyStats} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748b" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="winRate" name="Win Rate (%)" radius={[3, 3, 0, 0]}>
                  {dailyStats.map((d, i) => (
                    <Cell key={i} fill={d.winRate >= 50 ? "#26A69A" : "#EF5350"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">P&L zilnic ($)</h2>
          </div>
          {dailyStats.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Fără date</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyStats} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="pnl" name="P&L ($)" radius={[3, 3, 0, 0]}>
                  {dailyStats.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? "#26A69A" : "#EF5350"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Pair distribution + Exit reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-chart-gold" />
            <h2 className="font-semibold text-sm">Distribuție Tranzacții per Pereche</h2>
          </div>
          {pairDistribution.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Fără date</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pairDistribution} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#64748b" }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#94a3b8" }} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Nr. tranzacții" radius={[0, 3, 3, 0]}>
                  {pairDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-chart-purple" />
            <h2 className="font-semibold text-sm">Motive Ieșire</h2>
          </div>
          {exitReasons.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Fără date</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie data={exitReasons} cx="50%" cy="50%" outerRadius={75} dataKey="value" paddingAngle={2}>
                    {exitReasons.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-xs">
                {exitReasons.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground">{r.name}</span>
                    <span className="font-mono font-bold ml-auto">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per pair PnL */}
      {pairDistribution.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-chart-green" /> P&L per Pereche ($)
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={pairDistribution} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pnl" name="P&L ($)" radius={[3, 3, 0, 0]}>
                {pairDistribution.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? "#26A69A" : "#EF5350"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}