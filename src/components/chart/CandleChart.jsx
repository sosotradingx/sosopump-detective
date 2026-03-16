import React from "react";
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart } from "recharts";

// Custom candlestick shape
const CandleShape = (props) => {
  const { x, y, width, height, open, close, high, low, index, payload } = props;
  if (!payload) return null;

  const isGreen = payload.close >= payload.open;
  const color = isGreen ? "#26A69A" : "#EF5350";
  const bodyTop = Math.min(payload.openY, payload.closeY);
  const bodyH = Math.abs(payload.openY - payload.closeY) || 1;
  const centerX = x + width / 2;

  return (
    <g>
      {/* Wick */}
      <line x1={centerX} y1={payload.highY} x2={centerX} y2={payload.lowY} stroke={color} strokeWidth={1} />
      {/* Body */}
      <rect x={x + 1} y={bodyTop} width={width - 2} height={bodyH} fill={color} stroke={color} strokeWidth={0.5} />
    </g>
  );
};

// Custom tooltip
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isGreen = d.close >= d.open;
  return (
    <div style={{ background: "hsl(222, 47%, 8%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <p className="font-mono text-muted-foreground mb-1">{d.time}</p>
      <p style={{ color: isGreen ? "#26A69A" : "#EF5350" }}>O: {d.open?.toFixed(4)} C: {d.close?.toFixed(4)}</p>
      <p className="text-muted-foreground">H: {d.high?.toFixed(4)} L: {d.low?.toFixed(4)}</p>
    </div>
  );
};

export default function CandleChart({ klines }) {
  if (!klines || klines.length === 0) return null;

  const minPrice = Math.min(...klines.map(k => k.low)) * 0.998;
  const maxPrice = Math.max(...klines.map(k => k.high)) * 1.002;
  const priceRange = maxPrice - minPrice;
  const chartHeight = 300;

  // Pre-compute pixel Y positions for each candle
  const toY = (price) => ((maxPrice - price) / priceRange) * chartHeight;

  const data = klines.map((k) => ({
    time: new Date(k.time).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    // Pass pre-computed Y for custom shape
    highY: toY(k.high),
    lowY: toY(k.low),
    openY: toY(k.open),
    closeY: toY(k.close),
    // Bar value = high-low for spanning the full range slot
    candleHigh: k.high,
    candleLow: k.low,
  }));

  return (
    <div className="space-y-2">
      {/* Candlestick Chart using SVG overlay */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-mono text-muted-foreground mb-3">PREȚ (LUMÂNĂRI)</h3>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} interval="preserveStartEnd" />
            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }}
              width={75}
              tickFormatter={v => v >= 1000 ? v.toFixed(2) : v.toFixed(4)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="close"
              shape={(props) => {
                const d = props.payload;
                const isGreen = d.close >= d.open;
                const color = isGreen ? "#26A69A" : "#EF5350";
                const { x, y, width, height } = props;
                const chartH = chartHeight;
                const toYLocal = (price) => ((maxPrice - price) / priceRange) * chartH;
                const centerX = x + width / 2;
                const bodyTop = Math.min(toYLocal(d.open), toYLocal(d.close));
                const bodyH = Math.abs(toYLocal(d.open) - toYLocal(d.close)) || 1;
                const highY = toYLocal(d.high);
                const lowY = toYLocal(d.low);
                return (
                  <g>
                    <line x1={centerX} y1={highY} x2={centerX} y2={lowY} stroke={color} strokeWidth={1} />
                    <rect x={x + 1} y={bodyTop} width={Math.max(width - 2, 1)} height={bodyH} fill={color} />
                  </g>
                );
              }}
              fill="#26A69A"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-mono text-muted-foreground mb-3">VOLUM</h3>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} width={75} />
            <Tooltip contentStyle={{ background: "hsl(222, 47%, 8%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: 8, fontSize: 11 }} />
            <Bar
              dataKey="volume"
              isAnimationActive={false}
              radius={[2, 2, 0, 0]}
              fill="#2196F3"
              opacity={0.6}
              shape={(props) => {
                const d = props.payload;
                const color = d.close >= d.open ? "#26A69A" : "#EF5350";
                return <rect {...props} fill={color} opacity={0.6} rx={2} ry={2} />;
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}