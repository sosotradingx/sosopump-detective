import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Clock, Crown, Zap, Star, AlertCircle, CheckCircle } from "lucide-react";

const WALLET_ADDRESS = "0xYOUR_USDC_BEP20_WALLET_HERE"; // ← înlocuiește cu adresa ta

const PLANS = [
  {
    key: "pro",
    name: "Pro",
    icon: Star,
    color: "text-primary",
    borderColor: "border-primary/50",
    price_monthly: 50,
    price_3months: 130,
    price_6months: 249,
    features: [
      "Scanner complet (toate perechile)",
      "Paper Trading",
      "Backtesting avansat",
      "Multi-Chart",
      "Alerte în timp real",
      "Export rapoarte",
    ],
    locked: ["Live Trading", "Auto-Bot Real"],
  },
  {
    key: "elite",
    name: "Elite",
    icon: Crown,
    color: "text-yellow-400",
    borderColor: "border-yellow-500/50",
    price_monthly: 100,
    price_3months: 260,
    price_6months: 499,
    features: [
      "Totul din Pro",
      "Live Trading pe Binance",
      "Auto-Bot cu bani reali",
      "API Key Management",
      "Prioritate suport",
      "Acces beta features",
    ],
    locked: [],
  },
];

export default function Pricing() {
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: subscription } = useQuery({
    queryKey: ["mySubscription"],
    queryFn: async () => {
      const me = await base44.auth.me();
      const subs = await base44.entities.Subscription.filter({ user_email: me.email, status: "active" });
      return subs[0] || null;
    },
    enabled: !!user,
  });

  const { data: pendingSub } = useQuery({
    queryKey: ["myPendingSub"],
    queryFn: async () => {
      const me = await base44.auth.me();
      const subs = await base44.entities.Subscription.filter({ user_email: me.email, status: "pending" });
      return subs[0] || null;
    },
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const me = await base44.auth.me();
      const plan = PLANS.find(p => p.key === selectedPlan);
      const amount = selectedMonths === 1 ? plan.price_monthly
        : selectedMonths === 3 ? plan.price_3months
        : plan.price_6months;
      return base44.entities.Subscription.create({
        plan: selectedPlan,
        status: "pending",
        user_email: me.email,
        tx_hash: txHash,
        amount_paid: amount,
        months: selectedMonths,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["myPendingSub"] });
    },
  });

  const copyAddress = () => {
    navigator.clipboard.writeText(WALLET_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getPrice = (plan) => {
    if (selectedMonths === 1) return plan.price_monthly;
    if (selectedMonths === 3) return plan.price_3months;
    return plan.price_6months;
  };

  const activePlan = subscription?.plan;
  const isExpired = subscription?.expires_at && new Date(subscription.expires_at) < new Date();

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">💎 Planuri & Prețuri</h1>
        <p className="text-muted-foreground">Plată în <strong>USDC pe rețeaua BEP20 (BSC)</strong> · Activare manuală în max 24h</p>
      </div>

      {/* Active Subscription Banner */}
      {subscription && !isExpired && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-pump-strong" />
          <div>
            <p className="font-semibold text-pump-strong">Abonament Activ: {subscription.plan.toUpperCase()}</p>
            <p className="text-sm text-muted-foreground">
              Expiră: {subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString("ro-RO") : "Nedefinit"}
            </p>
          </div>
        </div>
      )}

      {/* Pending Banner */}
      {pendingSub && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-yellow-400" />
          <div>
            <p className="font-semibold text-yellow-400">Plată în așteptare: {pendingSub.plan.toUpperCase()}</p>
            <p className="text-sm text-muted-foreground">TX: {pendingSub.tx_hash || "—"} · Se verifică de admin</p>
          </div>
        </div>
      )}

      {/* Duration Toggle */}
      <div className="flex justify-center gap-2">
        {[
          { months: 1, label: "1 Lună" },
          { months: 3, label: "3 Luni", badge: "-14%" },
          { months: 6, label: "6 Luni", badge: "-27%" },
        ].map(opt => (
          <button
            key={opt.months}
            onClick={() => setSelectedMonths(opt.months)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all flex items-center gap-2 ${
              selectedMonths === opt.months
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {opt.label}
            {opt.badge && <Badge variant="outline" className="text-[9px] px-1 py-0">{opt.badge}</Badge>}
          </button>
        ))}
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Free Plan */}
        <div className={`bg-card border rounded-xl p-6 space-y-4 ${activePlan === "free" || !activePlan ? "border-border" : "border-border/50 opacity-70"}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Free</h2>
              <p className="text-muted-foreground text-sm">Mereu gratuit</p>
            </div>
            <span className="text-3xl font-bold">$0</span>
          </div>
          <ul className="space-y-2 text-sm">
            {["Scanner (top 50 perechi)", "Dashboard live", "Watchlist", "Paper Trading basic"].map(f => (
              <li key={f} className="flex items-center gap-2 text-muted-foreground">
                <Check className="w-4 h-4 text-pump-strong" /> {f}
              </li>
            ))}
            {["Backtesting", "Multi-Chart", "Live Trading", "Auto-Bot"].map(f => (
              <li key={f} className="flex items-center gap-2 text-muted-foreground/40 line-through">
                <Check className="w-4 h-4" /> {f}
              </li>
            ))}
          </ul>
          {(!activePlan || activePlan === "free") && (
            <Badge variant="outline" className="w-full justify-center py-1">Plan Curent</Badge>
          )}
        </div>

        {/* Paid Plans */}
        {PLANS.map(plan => {
          const Icon = plan.icon;
          const price = getPrice(plan);
          const isActive = activePlan === plan.key && !isExpired;
          const isSelected = selectedPlan === plan.key;

          return (
            <div
              key={plan.key}
              onClick={() => !isActive && setSelectedPlan(isSelected ? null : plan.key)}
              className={`bg-card border-2 rounded-xl p-6 space-y-4 cursor-pointer transition-all ${
                isActive ? `${plan.borderColor} opacity-80` :
                isSelected ? `${plan.borderColor} ring-2 ring-primary/30` :
                "border-border hover:border-border/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-5 h-5 ${plan.color}`} />
                  <h2 className="text-xl font-bold">{plan.name}</h2>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold">${price}</span>
                  <p className="text-xs text-muted-foreground">
                    {selectedMonths === 1 ? "/lună" : `/ ${selectedMonths} luni`}
                  </p>
                </div>
              </div>

              <ul className="space-y-2 text-sm">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className={`w-4 h-4 ${plan.color}`} /> {f}
                  </li>
                ))}
                {plan.locked.map(f => (
                  <li key={f} className="flex items-center gap-2 text-muted-foreground/40 line-through">
                    <Check className="w-4 h-4" /> {f}
                  </li>
                ))}
              </ul>

              {isActive ? (
                <Badge className="w-full justify-center py-1 bg-green-500/20 text-pump-strong border-pump-strong">
                  ✅ Activ
                </Badge>
              ) : (
                <Badge variant={isSelected ? "default" : "outline"} className="w-full justify-center py-1">
                  {isSelected ? "✓ Selectat" : "Selectează"}
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment Flow */}
      {selectedPlan && !submitted && (
        <div className="bg-card border border-primary/30 rounded-xl p-6 space-y-5">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Instrucțiuni Plată — {PLANS.find(p => p.key === selectedPlan)?.name} · ${getPrice(PLANS.find(p => p.key === selectedPlan))} USDC
          </h3>

          <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
            <p className="text-xs text-muted-foreground font-mono uppercase">Rețea</p>
            <p className="font-bold text-pump-active">BEP20 (Binance Smart Chain)</p>
            <p className="text-xs text-muted-foreground">Token: <strong>USDC</strong> · Contract oficial BSC</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase font-mono">Adresă Destinație USDC BEP20</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-secondary rounded-lg p-3 text-sm font-mono break-all">{WALLET_ADDRESS}</code>
              <Button variant="outline" size="icon" onClick={copyAddress}>
                {copied ? <Check className="w-4 h-4 text-pump-strong" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            Trimite exact <strong>${getPrice(PLANS.find(p => p.key === selectedPlan))} USDC</strong> pe rețeaua <strong>BEP20</strong>. 
            Nu trimite pe altă rețea (ETH, Polygon, etc) — fondurile se vor pierde!
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase font-mono">Hash Tranzacție (TX Hash) *</Label>
            <Input
              placeholder="0x... (copiază hash-ul din wallet după trimitere)"
              value={txHash}
              onChange={e => setTxHash(e.target.value)}
              className="bg-secondary font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Găsești hash-ul în istoricul walletului sau pe BscScan după confirmare</p>
          </div>

          <Button
            className="w-full bg-primary"
            disabled={!txHash || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? "Se trimite..." : "✅ Am Trimis Plata — Notifică Adminul"}
          </Button>
        </div>
      )}

      {/* Success */}
      {submitted && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center space-y-3">
          <CheckCircle className="w-12 h-12 text-pump-strong mx-auto" />
          <h3 className="text-lg font-bold text-pump-strong">Cerere Trimisă!</h3>
          <p className="text-muted-foreground text-sm">
            Adminul va verifica tranzacția pe BscScan și va activa abonamentul în <strong>maxim 24 ore</strong>.
            Vei primi confirmare pe email.
          </p>
        </div>
      )}

      {/* FAQ */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-sm">❓ Întrebări Frecvente</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div><p className="font-medium text-foreground">Cât durează activarea?</p><p>Maxim 24 ore după confirmarea tranzacției pe blockchain.</p></div>
          <div><p className="font-medium text-foreground">Ce wallet pot folosi?</p><p>Orice wallet BEP20: MetaMask, Trust Wallet, Binance Wallet etc.</p></div>
          <div><p className="font-medium text-foreground">Ce se întâmplă dacă trimit pe altă rețea?</p><p>Fondurile se pierd — asigură-te că selectezi BEP20 / BSC în wallet.</p></div>
          <div><p className="font-medium text-foreground">Pot reînnoi?</p><p>Da, trimiți o nouă plată cu noul TX hash înainte sau după expirare.</p></div>
        </div>
      </div>
    </div>
  );
}