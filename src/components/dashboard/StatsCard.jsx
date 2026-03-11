import React from "react";

export default function StatsCard({ title, value, subtitle, icon: Icon, color = "text-primary" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="p-2 bg-secondary rounded-lg">
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
        )}
      </div>
    </div>
  );
}