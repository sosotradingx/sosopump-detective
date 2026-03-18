import React from "react";
import { Bell, BellOff, X, Volume2, TrendingUp, TrendingDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";

const ICON_MAP = {
  pump: <TrendingUp className="w-3 h-3 text-pump-strong" />,
  volume: <Zap className="w-3 h-3 text-chart-gold" />,
  short: <TrendingDown className="w-3 h-3 text-chart-red" />,
};

export default function AlertsPanel({ alerts, onClear, onClearAll }) {
  const { permission, requestPermission, isSupported } = useNotifications();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Alerte ({alerts.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {isSupported && permission !== "granted" && (
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={requestPermission}>
              <Bell className="w-3 h-3 mr-1" /> Activează notificări
            </Button>
          )}
          {isSupported && permission === "granted" && (
            <span className="text-[10px] text-pump-strong font-mono flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-pump-strong animate-pulse" /> Notificări active
            </span>
          )}
          {alerts.length > 0 && (
            <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground" onClick={onClearAll}>
              Șterge tot
            </Button>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          <BellOff className="w-6 h-6 mx-auto mb-2 opacity-40" />
          Nicio alertă recentă
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
          {alerts.map((alert, i) => (
            <div key={i} className="flex items-start gap-2 p-3 hover:bg-accent/20">
              <div className="mt-0.5">{ICON_MAP[alert.type] || <Bell className="w-3 h-3" />}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono font-semibold">{alert.symbol}</p>
                <p className="text-[11px] text-muted-foreground">{alert.message}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{alert.time}</p>
              </div>
              <Button size="icon" variant="ghost" className="w-5 h-5 shrink-0" onClick={() => onClear(i)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}