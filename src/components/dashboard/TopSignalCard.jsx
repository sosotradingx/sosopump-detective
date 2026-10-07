import React from "react";
import { Badge } from "@/components/ui/badge";
import MarketRegimeBadge from "@/components/dashboard/MarketRegimeBadge";
import { TrendingUp, ShieldAlert, Layers } from "lucide-react";

const STATUS_STYLE = {
  STRONG: "bg-pump-strong/20 text-pump-strong border-pump-strong/30",
  ACTIVE: "bg-pump-active/20 text-pump-active border-pump-active/30",
  EARLY: "bg-pump-early/20 text-pump-early border-pump-early/30",
  WATCH: "bg-chart-blue/20 text-chart-blue border-chart-blue/30",
  DUMP_RISK: "bg-destructive/20 text-destructive border-destructive/30",
  INACTIVE: "bg-pump-inactive/20 text-pump-inactive border-pump-inactive/30",
};

function Axis({ label, value, color, icon: Icon }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <span className="flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</span>
        <span className="text-foreground font-bold">{value ?? 0}%</span>
      </div>
      <div className="w-full h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

export default function TopSignalCard({ item }) {
  if (!item) return null;
  const sig = item.sig;
  const micro = item.micro;
  const deriv = item.deriv;
  const cascade = [
    { tf: "5m", role: "trigger", active: !!item.mtf?.trigger },
    { tf: "15m", role: "confirmare", active: !!item.mtf?.confirm },
    { tf: "1h", role: "context", active: !!sig?.contextOk },
    { tf: "4h", role: "context", active: !!sig?.aligned4h },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold">🏆 Top Signal</h3>
        <MarketRegimeBadge regime={item.base?.marketRegime || "MIXED"} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xl font-bold font-mono">{item.symbol}</p>
        <Badge className={`text-[10px] ${STATUS_STYLE[item.status] || STATUS_STYLE.INACTIVE}`}>
          {item.emoji} {item.status}
        </Badge>
      </div>

      <div className="space-y-2">
        <Axis label="PUMP STRENGTH" value={item.strength} color="bg-pump-strong" icon={TrendingUp} />
        <Axis label="MANIPULATION" value={item.manipulation} color="bg-destructive" icon={ShieldAlert} />
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <Layers className="w-3 h-3 text-muted-foreground" />
        {cascade.map(c => (
          <span
            key={c.tf}
            className={`text-[10px] px-2 py-0.5 rounded font-mono ${
              c.active ? "bg-chart-green/20 text-chart-green" : "bg-secondary text-muted-foreground"
            }`}
          >
            {c.active ? "✓" : "○"} {c.tf}
          </span>
        ))}
      </div>

      {deriv && (
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-secondary/40 rounded-lg p-2">
          <span className="text-muted-foreground">OI 1h: <span className={deriv.oiChangePct >= 0 ? "text-chart-green" : "text-chart-red"}>
            {deriv.oiChangePct != null ? `${deriv.oiChangePct >= 0 ? "+" : ""}${deriv.oiChangePct.toFixed(1)}%` : "—"}
          </span></span>
          <span className="text-muted-foreground">Funding: <span className={deriv.fundingRate >= 0.05 ? "text-pump-active" : "text-foreground"}>
            {deriv.fundingRate != null ? `${deriv.fundingRate.toFixed(3)}%` : "—"}
          </span></span>
          <span className="text-muted-foreground">L/S retail: <span className="text-foreground">{deriv.longShortRatio != null ? deriv.longShortRatio.toFixed(2) : "—"}</span></span>
          <span className="text-muted-foreground">Perp/Spot: <span className={deriv.perpSpotRatio >= 10 ? "text-destructive" : "text-foreground"}>
            {deriv.perpSpotRatio != null ? `${deriv.perpSpotRatio.toFixed(1)}×` : "—"}
          </span></span>
          <span className="text-muted-foreground">Taker buy: <span className="text-foreground">{micro?.takerBuyRatio != null ? `${(micro.takerBuyRatio * 100).toFixed(1)}%` : "—"}</span></span>
          <span className="text-muted-foreground">Alpha BTC: <span className={sig?.alpha1h >= 0.5 ? "text-chart-green" : "text-pump-active"}>
            {sig?.alpha1h != null ? `${sig.alpha1h >= 0 ? "+" : ""}${sig.alpha1h.toFixed(1)}%` : "—"}
          </span></span>
        </div>
      )}

      {sig?.dumpFactors?.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/25 rounded-lg p-2">
          <p className="text-[10px] font-mono text-destructive mb-1">☠️ RISC DE DUMP</p>
          {sig.dumpFactors.map((f, i) => (
            <p key={i} className="text-[10px] text-muted-foreground">• {f}</p>
          ))}
        </div>
      )}

      {sig?.reasons?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sig.reasons.slice(0, 5).map((r, i) => (
            <span key={i} className="text-[10px] bg-chart-blue/15 text-chart-blue px-2 py-0.5 rounded">{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}