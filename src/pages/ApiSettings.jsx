import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Key, Plus, Trash2, CheckCircle, AlertCircle, Loader2, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import PlanGate from "@/components/PlanGate";

export default function ApiSettings() {
  const { isPro, loading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(null);
  const [form, setForm] = useState({ api_key: "", api_secret: "", market_type: "futures", label: "" });

  const [user, setUser] = React.useState(null);
  React.useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["userApiKeys", user?.email],
    queryFn: () => base44.entities.UserApiKey.filter({ created_by: user.email }, "-created_date"),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.UserApiKey.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userApiKeys"] });
      setShowForm(false);
      setForm({ api_key: "", api_secret: "", market_type: "futures", label: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.UserApiKey.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["userApiKeys"] }),
  });

  const testConnection = async (keyRecord) => {
    setTesting(keyRecord.id);
    try {
      const isFutures = (keyRecord.market_type || "futures") === "futures";
      const baseUrl = isFutures
        ? "https://fapi.binance.com/fapi/v1/account"
        : "https://api.binance.com/api/v3/account";
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;

      // Sign with HMAC-SHA256
      const encoder = new TextEncoder();
      const keyData = encoder.encode(keyRecord.api_secret);
      const msgData = encoder.encode(queryString);
      const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
      const sigHex = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

      const url = `${baseUrl}?${queryString}&signature=${sigHex}`;
      const resp = await fetch(url, { headers: { "X-MBX-APIKEY": keyRecord.api_key } });
      const data = await resp.json();

      const success = resp.ok && !data.code;
      await base44.entities.UserApiKey.update(keyRecord.id, {
        test_status: success ? "ok" : "error",
        test_message: success ? "Conexiune reușită ✓" : (data.msg || `Eroare ${resp.status}`),
        last_tested_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["userApiKeys"] });
    } catch (e) {
      await base44.entities.UserApiKey.update(keyRecord.id, {
        test_status: "error",
        test_message: e.message,
        last_tested_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["userApiKeys"] });
    }
    setTesting(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  if (!subLoading && !isPro) {
    return <PlanGate requiredPlan="pro" feature="API Keys (Live Trading)" />;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">🔑 API Keys</h1>
            <p className="text-sm text-muted-foreground">Gestionează cheile API Binance</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-primary">
          <Plus className="w-4 h-4 mr-2" /> Adaugă Cheie
        </Button>
      </div>

      {/* Security Warning */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-yellow-400">Atenție la Securitate</p>
          <p className="text-muted-foreground mt-1">
            Folosește chei API cu permisiuni <strong>doar pentru Futures Trading</strong>. 
            Dezactivează opțiunile de Withdrawal. Cheile sunt stocate în baza de date a aplicației.
          </p>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Adaugă Cheie Nouă</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Etichetă (opțional)</Label>
              <Input placeholder="ex: Main Account" value={form.label}
                onChange={e => setF("label", e.target.value)} className="bg-secondary mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">API Key *</Label>
              <Input placeholder="Binance API Key" value={form.api_key}
                onChange={e => setF("api_key", e.target.value)} className="bg-secondary mt-1 font-mono text-xs" required />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">API Secret *</Label>
              <div className="relative mt-1">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder="Binance API Secret"
                  value={form.api_secret}
                  onChange={e => setF("api_secret", e.target.value)}
                  className="bg-secondary font-mono text-xs pr-10" required
                />
                <button type="button" onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tip Piață</Label>
              <Select value={form.market_type} onValueChange={v => setF("market_type", v)}>
                <SelectTrigger className="bg-secondary mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="futures">Futures (USDT-M)</SelectItem>
                  <SelectItem value="spot">Spot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvează
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            </div>
          </form>
        </div>
      )}

      {/* Keys List */}
      <div className="space-y-3">
        {isLoading && <p className="text-muted-foreground text-sm">Se încarcă...</p>}
        {keys.length === 0 && !isLoading && !showForm && (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <Key className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">Nicio cheie API adăugată</p>
            <p className="text-xs text-muted-foreground mt-1">Apasă "Adaugă Cheie" pentru a începe</p>
          </div>
        )}
        {keys.map(k => (
          <div key={k.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${k.test_status === "ok" ? "bg-pump-strong" : k.test_status === "error" ? "bg-destructive" : "bg-muted-foreground"}`} />
                <div>
                  <p className="text-sm font-semibold">{k.label || "API Key"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{k.api_key?.slice(0, 8)}...{k.api_key?.slice(-4)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{k.market_type || "futures"}</Badge>
                {k.test_status === "ok" && <CheckCircle className="w-4 h-4 text-pump-strong" />}
                {k.test_status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
              </div>
            </div>

            {k.test_message && (
              <p className={`text-xs mt-2 px-3 py-1.5 rounded ${k.test_status === "ok" ? "bg-green-500/10 text-pump-strong" : "bg-destructive/10 text-destructive"}`}>
                {k.test_message}
              </p>
            )}
            {k.last_tested_at && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Testat: {new Date(k.last_tested_at).toLocaleString("ro-RO")}
              </p>
            )}

            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => testConnection(k)} disabled={testing === k.id}>
                {testing === k.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Testează Conexiunea
              </Button>
              <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(k.id)}>
                <Trash2 className="w-3 h-3 mr-1" /> Șterge
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}