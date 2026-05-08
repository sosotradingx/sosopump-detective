import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, BellOff, Mail, Loader2, CheckCircle, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function EmailAlertSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: pref, isLoading } = useQuery({
    queryKey: ["alertPref", user?.email],
    queryFn: async () => {
      const list = await base44.entities.AlertPreference.filter({ user_email: user.email }, "-created_date", 1);
      return list[0] || null;
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({
    enabled: true,
    min_score: 70,
    max_alerts_per_hour: 5,
    pump_statuses: ["STRONG", "ACTIVE"],
  });

  useEffect(() => {
    if (pref) {
      setForm({
        enabled: pref.enabled ?? true,
        min_score: pref.min_score ?? 70,
        max_alerts_per_hour: pref.max_alerts_per_hour ?? 5,
        pump_statuses: pref.pump_statuses ?? ["STRONG", "ACTIVE"],
      });
    }
  }, [pref]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, user_email: user.email };
      if (pref?.id) {
        return base44.entities.AlertPreference.update(pref.id, payload);
      } else {
        return base44.entities.AlertPreference.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertPref"] });
      toast({ title: "Salvat!", description: "Preferințele de alertă au fost actualizate." });
    },
  });

  const handleStatusToggle = (status) => {
    setForm(prev => {
      const current = prev.pump_statuses || [];
      const updated = current.includes(status)
        ? current.filter(s => s !== status)
        : [...current, status];
      return { ...prev, pump_statuses: updated };
    });
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      await base44.integrations.Core.SendEmail({
        to: user.email,
        subject: "🧪 Test Alertă SOSO PUMP Detective",
        body: `<div style="background:#0d1117;color:#e6edf3;font-family:Inter,sans-serif;padding:24px">
          <h2 style="color:#f97316">✅ Alertele email funcționează!</h2>
          <p>Dacă ai primit acest email, sistemul de alerte SOSO PUMP este configurat corect.</p>
          <p style="color:#8b949e;font-size:12px">Trimis la: ${new Date().toLocaleString("ro-RO")}</p>
        </div>`,
      });
      toast({ title: "Email de test trimis!", description: `Verifică inbox-ul la ${user.email}` });
    } catch (e) {
      toast({ title: "Eroare", description: e.message, variant: "destructive" });
    }
    setTesting(false);
  };

  if (isLoading || !user) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const STATUSES = [
    { value: "STRONG", label: "STRONG", color: "text-pump-strong", bg: "bg-pump-strong/10 border-pump-strong/30" },
    { value: "ACTIVE", label: "ACTIVE", color: "text-pump-active", bg: "bg-pump-active/10 border-pump-active/30" },
    { value: "EARLY", label: "EARLY", color: "text-pump-early", bg: "bg-pump-early/10 border-pump-early/30" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {form.enabled ? (
            <Bell className="w-5 h-5 text-primary" />
          ) : (
            <BellOff className="w-5 h-5 text-muted-foreground" />
          )}
          <div>
            <h2 className="text-base font-semibold">Alerte Email</h2>
            <p className="text-xs text-muted-foreground">Primește notificări când scanerul detectează pump-uri</p>
          </div>
        </div>
        <Switch
          checked={form.enabled}
          onCheckedChange={(v) => setForm(prev => ({ ...prev, enabled: v }))}
        />
      </div>

      {/* Email display */}
      <div className="bg-secondary/40 rounded-lg p-3 flex items-center gap-2">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-mono">{user.email}</span>
        <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={handleTestEmail} disabled={testing}>
          {testing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
          Test
        </Button>
      </div>

      <div className={`space-y-5 ${!form.enabled ? "opacity-40 pointer-events-none" : ""}`}>
        {/* Min score */}
        <div>
          <Label className="text-xs text-muted-foreground">Scor minim pentru alertă</Label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min="30"
              max="95"
              step="5"
              value={form.min_score}
              onChange={e => setForm(prev => ({ ...prev, min_score: Number(e.target.value) }))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-bold font-mono w-12 text-right text-primary">{form.min_score}%</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Vei primi alerte doar pentru perechi cu scor ≥ {form.min_score}%
          </p>
        </div>

        {/* Pump statuses */}
        <div>
          <Label className="text-xs text-muted-foreground">Statusuri monitorizate</Label>
          <div className="flex gap-2 mt-2">
            {STATUSES.map(s => (
              <button
                key={s.value}
                onClick={() => handleStatusToggle(s.value)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  (form.pump_statuses || []).includes(s.value)
                    ? `${s.bg} ${s.color}`
                    : "border-border text-muted-foreground/50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Max per hour */}
        <div>
          <Label className="text-xs text-muted-foreground">Max alerte pe oră</Label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={form.max_alerts_per_hour}
              onChange={e => setForm(prev => ({ ...prev, max_alerts_per_hour: Number(e.target.value) }))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-bold font-mono w-12 text-right text-primary">{form.max_alerts_per_hour}</span>
          </div>
        </div>
      </div>

      {/* Last alert info */}
      {pref?.last_alert_sent_at && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-pump-strong" />
          Ultima alertă trimisă: {new Date(pref.last_alert_sent_at).toLocaleString("ro-RO")}
        </div>
      )}

      {/* Save button */}
      <Button
        onClick={() => saveMutation.mutate(form)}
        disabled={saveMutation.isPending}
        className="w-full bg-primary"
      >
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Salvează Preferințele
      </Button>
    </div>
  );
}