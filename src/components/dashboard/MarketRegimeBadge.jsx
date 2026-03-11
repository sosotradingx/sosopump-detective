import React from "react";
import { TrendingUp, Activity, Minus } from "lucide-react";

export default function MarketRegimeBadge({ regime }) {
  const config = {
    TRENDING: { icon: TrendingUp, color: "text-pump-strong bg-pump-strong/10 border-pump-strong/20", label: "TRENDING" },
    RANGING: { icon: Minus, color: "text-pump-inactive bg-pump-inactive/10 border-pump-inactive/20", label: "RANGING" },
    MIXED: { icon: Activity, color: "text-pump-active bg-pump-active/10 border-pump-active/20", label: "MIXED" },
  };
  const c = config[regime] || config.MIXED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-mono font-medium ${c.color}`}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}