import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Line } from "recharts";

export default function PriceChart({ klines, analysis }) {
  if (!klines || klines.length === 0) return null;

  const data = klines.map((k, i) => ({
    time: new Date(k.time).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
    price: k.close,
    volume: k.volume,
    high: k.high,
    low: k.low,
    open: k.open,
  }));

  const minPrice = Math.min(...data.map(d => d.low)) * 0.998;
  const maxPrice = Math.max(...data.map(d => d.high)) * 1.002;

  return (
    <div className="space-y-2">
      {/* Price Chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-mono text-muted-foreground mb-3">PREȚ</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(25, 95%, 53%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(25, 95%, 53%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} interval="preserveStartEnd" />
            <YAxis domain={[minPrice, maxPrice]} tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} width={70} />
            <Tooltip
              contentStyle={{
                background: "hsl(222, 47%, 8%)",
                border: "1px solid hsl(222, 30%, 18%)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area type="monotone" dataKey="price" stroke="hsl(25, 95%, 53%)" fill="url(#priceGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Volume Chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-mono text-muted-foreground mb-3">VOLUM</h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} width={70} />
            <Tooltip
              contentStyle={{
                background: "hsl(222, 47%, 8%)",
                border: "1px solid hsl(222, 30%, 18%)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="volume"
              fill="hsl(210, 90%, 60%)"
              opacity={0.6}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}