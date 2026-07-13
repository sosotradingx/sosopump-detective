import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_CONFIG = {
  active: { label: "Activ", className: "bg-pump-strong/10 text-pump-strong" },
  orphaned: { label: "Orfan", className: "bg-pump-active/10 text-pump-active" },
  stopped: { label: "Oprit", className: "bg-secondary text-muted-foreground" },
};

export default function SessionRow({ session, status, onTerminate, isTerminating }) {
  const cfg = STATUS_CONFIG[status];
  const startedAt = session.started_at
    ? new Date(session.started_at).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";
  const lastBeat = session.last_heartbeat ? formatDistanceToNow(new Date(session.last_heartbeat), { addSuffix: true }) : "—";

  return (
    <tr className="border-b border-border/50 hover:bg-accent/30">
      <td className="p-3 font-mono text-xs">{session.session_id?.slice(0, 16)}…</td>
      <td className="p-3 text-xs text-muted-foreground font-mono">{startedAt}</td>
      <td className="p-3 text-xs text-muted-foreground font-mono">{lastBeat}</td>
      <td className="p-3 text-center">
        <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{session.timeframe || "—"}</span>
      </td>
      <td className="p-3 text-center">
        <Badge className={`text-[10px] ${cfg.className}`}>{cfg.label}</Badge>
      </td>
      <td className="p-3 text-center">
        {status !== "stopped" ? (
          <Button variant="destructive" size="sm" onClick={onTerminate} disabled={isTerminating}>
            {isTerminating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <X className="w-3 h-3 mr-1" />} Oprește
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}