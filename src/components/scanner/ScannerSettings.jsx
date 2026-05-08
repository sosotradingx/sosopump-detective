import React from "react";
import { X, Settings, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubscription } from "@/hooks/useSubscription";

export default function ScannerSettings({ settings, onChange, onClose }) {
  const { isFree } = useSubscription();
  const set = (key, val) => {
    if (key === "maxPairs" && isFree && Number(val) > 50) return;
    onChange({ ...settings, [key]: val });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border-l border-border h-full w-full max-w-sm overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            <span className="font-semibold">Setări Scanner</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 space-y-6">
          {/* Timeframe */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Timeframe Analiză</h3>
            <Select value={settings.timeframe} onValueChange={v => set("timeframe", v)}>
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5m">5 minute</SelectItem>
                <SelectItem value="15m">15 minute</SelectItem>
                <SelectItem value="30m">30 minute</SelectItem>
                <SelectItem value="1h">1 oră</SelectItem>
                <SelectItem value="4h">4 ore</SelectItem>
                <SelectItem value="1d">1 zi</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Market Source */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Sursă Date</h3>
            <Select value={settings.marketSource || "perpetuals"} onValueChange={v => set("marketSource", v)}>
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="perpetuals">🔮 Perpetuals Futures (~600)</SelectItem>
                <SelectItem value="spot">📈 Spot Market</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Pairs limit */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Număr Perechi (Top N)</h3>
            <Select value={String(settings.maxPairs)} onValueChange={v => set("maxPairs", Number(v))}>
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">Top 50</SelectItem>
                <SelectItem value="100" disabled={isFree}>
                  <span className="flex items-center gap-2">Top 100 {isFree && <Lock className="w-3 h-3 opacity-50" />}</span>
                </SelectItem>
                <SelectItem value="200" disabled={isFree}>
                  <span className="flex items-center gap-2">Top 200 {isFree && <Lock className="w-3 h-3 opacity-50" />}</span>
                </SelectItem>
                <SelectItem value="300" disabled={isFree}>
                  <span className="flex items-center gap-2">Top 300 {isFree && <Lock className="w-3 h-3 opacity-50" />}</span>
                </SelectItem>
                <SelectItem value="500" disabled={isFree}>
                  <span className="flex items-center gap-2">Top 500 {isFree && <Lock className="w-3 h-3 opacity-50" />}</span>
                </SelectItem>
                <SelectItem value="0" disabled={isFree}>
                  <span className="flex items-center gap-2">Toate (~600) {isFree && <Lock className="w-3 h-3 opacity-50" />}</span>
                </SelectItem>
              </SelectContent>
            </Select>
            {isFree && <p className="text-xs text-primary mt-1">⬆️ Upgrade la PRO pentru mai multe perechi.</p>}
            {!isFree && <p className="text-xs text-muted-foreground mt-1">Sortate după volum 24h descrescător. Batch-uri de 25 cu pauze safe.</p>}
          </section>

          {/* Indicators */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Indicatori Activi</h3>
            <div className="space-y-3">
              {[
                { key: "use_macd_confirmation", label: "MACD Confirmation" },
                { key: "use_bb_squeeze", label: "Bollinger Bands Squeeze" },
                { key: "use_adx_filter", label: "ADX Filter" },
                { key: "use_obv_divergence", label: "OBV Divergence" },
                { key: "use_volume_accumulation", label: "Volume Accumulation" },
                { key: "use_trend_filter", label: "Trend Filter (EMA200)" },
                { key: "use_market_regime", label: "Market Regime" },
                { key: "noise_filter", label: "Noise Filter (ATR)" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-sm cursor-pointer">{label}</Label>
                  <Switch
                    checked={settings[key] !== false}
                    onCheckedChange={v => set(key, v)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Volume */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Volum Minim 24h</h3>
            <Select value={String(settings.minVolume)} onValueChange={v => set("minVolume", Number(v))}>
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="500000">$500K</SelectItem>
                <SelectItem value="1000000">$1M</SelectItem>
                <SelectItem value="5000000">$5M</SelectItem>
                <SelectItem value="10000000">$10M</SelectItem>
              </SelectContent>
            </Select>
          </section>
        </div>

        <div className="p-4 border-t border-border sticky bottom-0 bg-card">
          <Button className="w-full bg-primary" onClick={onClose}>
            Aplică Setările
          </Button>
        </div>
      </div>
    </div>
  );
}