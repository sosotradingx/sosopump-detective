import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Clock, ExternalLink, RefreshCw, Shield } from "lucide-react";

const STATUS_COLOR = {
  active: "text-pump-strong",
  pending: "text-yellow-400",
  expired: "text-muted-foreground",
  cancelled: "text-chart-red",
};

const PLAN_MONTHS = { pro: 1, elite: 1 }; // default, override per record

export default function AdminSubscriptions() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [notes, setNotes] = useState({});

  React.useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setAuthChecked(true); }).catch(() => setAuthChecked(true));
  }, []);

  const { data: allSubs = [], isLoading, refetch } = useQuery({
    queryKey: ["allSubscriptions"],
    queryFn: () => base44.entities.Subscription.list("-created_date", 200),
    enabled: user?.role === "admin",
  });

  const approveMutation = useMutation({
    mutationFn: async ({ sub }) => {
      const months = sub.months || 1;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + months);
      return base44.entities.Subscription.update(sub.id, {
        status: "active",
        expires_at: expiresAt.toISOString(),
        notes: notes[sub.id] || sub.notes || "",
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["allSubscriptions"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ sub }) => {
      return base44.entities.Subscription.update(sub.id, {
        status: "cancelled",
        notes: notes[sub.id] || sub.notes || "Respins de admin",
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["allSubscriptions"] }),
  });

  const expireMutation = useMutation({
    mutationFn: (id) => base44.entities.Subscription.update(id, { status: "expired" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["allSubscriptions"] }),
  });

  if (!authChecked) return <div className="p-8 text-center text-muted-foreground">Se verifică...</div>;
  if (!user || user.role !== "admin") {
    return (
      <div className="p-8 text-center">
        <Shield className="w-12 h-12 text-destructive mx-auto mb-3 opacity-50" />
        <p className="text-destructive font-semibold">Acces interzis — doar Admin</p>
      </div>
    );
  }

  const pending = allSubs.filter(s => s.status === "pending");
  const active = allSubs.filter(s => s.status === "active");
  const others = allSubs.filter(s => !["pending", "active"].includes(s.status));

  const SubRow = ({ sub }) => {
    const isExpired = sub.expires_at && new Date(sub.expires_at) < new Date();
    return (
      <tr className="border-b border-border/40 hover:bg-accent/10">
        <td className="p-3 text-xs font-mono">{sub.user_email}</td>
        <td className="p-3 text-center">
          <Badge variant="outline" className="text-xs uppercase">{sub.plan}</Badge>
        </td>
        <td className="p-3 text-center">
          <span className={`text-xs font-bold ${STATUS_COLOR[sub.status]}`}>
            {sub.status}{isExpired && sub.status === "active" ? " ⚠️ Expirat" : ""}
          </span>
        </td>
        <td className="p-3 text-center text-xs text-muted-foreground">{sub.months || 1} luni</td>
        <td className="p-3 text-right text-xs font-mono">${sub.amount_paid || "—"}</td>
        <td className="p-3 text-center">
          {sub.tx_hash ? (
            <a href={`https://bscscan.com/tx/${sub.tx_hash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono">
              {sub.tx_hash.slice(0, 8)}... <ExternalLink className="w-3 h-3" />
            </a>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="p-3 text-xs text-muted-foreground">
          {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString("ro-RO") : "—"}
        </td>
        <td className="p-3">
          <Input
            placeholder="Note..."
            value={notes[sub.id] ?? sub.notes ?? ""}
            onChange={e => setNotes(prev => ({ ...prev, [sub.id]: e.target.value }))}
            className="bg-secondary text-xs h-7 w-28"
          />
        </td>
        <td className="p-3">
          <div className="flex gap-1">
            {sub.status === "pending" && (
              <>
                <Button size="sm" className="h-7 px-2 bg-pump-strong text-white text-xs hover:bg-green-600"
                  onClick={() => approveMutation.mutate({ sub })}>
                  <CheckCircle className="w-3 h-3 mr-1" /> Aprobă
                </Button>
                <Button size="sm" variant="destructive" className="h-7 px-2 text-xs"
                  onClick={() => rejectMutation.mutate({ sub })}>
                  <XCircle className="w-3 h-3 mr-1" /> Respinge
                </Button>
              </>
            )}
            {sub.status === "active" && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                onClick={() => expireMutation.mutate(sub.id)}>
                Expiră
              </Button>
            )}
            {sub.status === "cancelled" && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                onClick={() => approveMutation.mutate({ sub })}>
                Reactivează
              </Button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Admin — Abonamente
          </h1>
          <p className="text-sm text-muted-foreground">Gestionează plățile USDC BEP20</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-sm">
            <span className="text-yellow-400 font-bold">{pending.length} pending</span>
            <span className="text-pump-strong font-bold">{active.length} active</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Pending - prioritate */}
      {pending.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-yellow-500/20 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <h2 className="text-sm font-semibold text-yellow-400">În Așteptare ({pending.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left p-3">Email</th>
                <th className="text-center p-3">Plan</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Luni</th>
                <th className="text-right p-3">Sumă $</th>
                <th className="text-center p-3">TX Hash</th>
                <th className="text-center p-3">Expiră</th>
                <th className="text-left p-3">Note</th>
                <th className="text-left p-3">Acțiuni</th>
              </tr></thead>
              <tbody>{pending.map(s => <SubRow key={s.id} sub={s} />)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-pump-strong" />
          <h2 className="text-sm font-semibold">Active ({active.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left p-3">Email</th>
              <th className="text-center p-3">Plan</th>
              <th className="text-center p-3">Status</th>
              <th className="text-center p-3">Luni</th>
              <th className="text-right p-3">Sumă $</th>
              <th className="text-center p-3">TX Hash</th>
              <th className="text-center p-3">Expiră</th>
              <th className="text-left p-3">Note</th>
              <th className="text-left p-3">Acțiuni</th>
            </tr></thead>
            <tbody>
              {active.length === 0
                ? <tr><td colSpan={9} className="p-6 text-center text-muted-foreground text-sm">Niciun abonament activ</td></tr>
                : active.map(s => <SubRow key={s.id} sub={s} />)
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Others */}
      {others.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-muted-foreground">Istoric ({others.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left p-3">Email</th>
                <th className="text-center p-3">Plan</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Luni</th>
                <th className="text-right p-3">Sumă $</th>
                <th className="text-center p-3">TX Hash</th>
                <th className="text-center p-3">Expiră</th>
                <th className="text-left p-3">Note</th>
                <th className="text-left p-3">Acțiuni</th>
              </tr></thead>
              <tbody>{others.map(s => <SubRow key={s.id} sub={s} />)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}