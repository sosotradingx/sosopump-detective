import React from "react";
import { X, Bot, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AutoTradeSettings({ config, onChange, onClose }) {
  const set = (key, val) => onChange({ ...config, [key]: val });

  const ToggleRow = ({ label, configKey, description }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-0">
      <div>
        <Label className="text-sm">{label}</Label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Switch checked={config[configKey] ?? true} onCheckedChange={v => set(configKey, v)} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border-l border-border h-full w-full max-w-sm overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <span className="font-semibold">Auto-Trade Setări</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 space-y-5">

          {/* Trading params */}
          <section className="space-y-3">
            <h3 className="text-xs font-mono uppercase text-muted-foreground border-b border-border pb-1">📊 Parametri Trading</h3>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Scor Minim Pump ({config.minScore})</Label>
              <Select value={String(config.minScore)} onValueChange={v => set("minScore", Number(v))}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10,20,30,40,50,60,70,80,90,100].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Valoare Tranzacție (USDT)</Label>
              <Input type="number" min="10" max="10000" step="10" value={config.tradeSize}
                onChange={e => set("tradeSize", Number(e.target.value))} className="bg-secondary" />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Max Poziții Deschise</Label>
              <Input type="number" min="1" max="100" step="1" value={config.maxOpenTrades}
                onChange={e => set("maxOpenTrades", Math.max(1, Number(e.target.value)))} className="bg-secondary" />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Timeframe Analiză</Label>
              <Select value={config.timeframe} onValueChange={v => set("timeframe", v)}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">1 minut</SelectItem>
                  <SelectItem value="3m">3 minute</SelectItem>
                  <SelectItem value="5m">5 minute</SelectItem>
                  <SelectItem value="15m">15 minute</SelectItem>
                  <SelectItem value="30m">30 minute</SelectItem>
                  <SelectItem value="1h">1 oră</SelectItem>
                  <SelectItem value="4h">4 ore</SelectItem>
                  <SelectItem value="1d">1 zi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Sursă Piață</Label>
              <Select value={config.marketSource || "perpetuals"} onValueChange={v => set("marketSource", v)}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="perpetuals">🔮 Perpetuals Futures</SelectItem>
                  <SelectItem value="spot">📈 Spot Market</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Perechi Scanate (Top N)</Label>
              <Select value={String(config.scanPairs ?? 100)} onValueChange={v => set("scanPairs", Number(v))}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100</SelectItem>
                  <SelectItem value="200">Top 200</SelectItem>
                  <SelectItem value="300">Top 300</SelectItem>
                  <SelectItem value="500">Top 500</SelectItem>
                  <SelectItem value="0">Toate (~600)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Batch-uri de 25 cu pauze 300ms. Mai multe perechi = scan mai lent dar mai complet.</p>
            </div>
          </section>

          {/* Risk management */}
          <section className="space-y-3">
            <h3 className="text-xs font-mono uppercase text-muted-foreground border-b border-border pb-1">⚠️ Risk Management</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Stop Loss (%)</Label>
                <Input type="number" min="0.5" max="20" step="0.5" value={config.stopLossPct}
                  onChange={e => set("stopLossPct", Number(e.target.value))} className="bg-secondary" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Take Profit (%)</Label>
                <Input type="number" min="1" max="200" step="1" value={config.takeProfitPct}
                  onChange={e => set("takeProfitPct", Number(e.target.value))} className="bg-secondary" />
              </div>
            </div>

            <ToggleRow label="Închide la Take Profit" configKey="autoTP" />
            <ToggleRow label="Închide la Stop Loss" configKey="autoSL" />
            <ToggleRow label="Exit la Scor < 20" configKey="autoExitLowScore" description="Închide dacă semnalul dispare" />

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                🕐 Cooldown după TP/SL ({config.cooldownMinutes ?? 60} min)
              </Label>
              <Select value={String(config.cooldownMinutes ?? 60)} onValueChange={v => set("cooldownMinutes", Number(v))}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Fără cooldown</SelectItem>
                  <SelectItem value="15">15 minute</SelectItem>
                  <SelectItem value="30">30 minute</SelectItem>
                  <SelectItem value="60">1 oră</SelectItem>
                  <SelectItem value="120">2 ore</SelectItem>
                  <SelectItem value="240">4 ore</SelectItem>
                  <SelectItem value="1440">24 ore</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Timp de așteptare înainte de a reintra pe același simbol după TP sau SL.</p>
            </div>
          </section>

          {/* Indicator filters */}
          <section className="space-y-1">
            <h3 className="text-xs font-mono uppercase text-muted-foreground border-b border-border pb-1">🔬 Filtre Indicatori</h3>

            <ToggleRow label="MACD Confirmation" configKey="useMacd" description="Crossover bullish MACD" />
            <ToggleRow label="Bollinger Band Squeeze" configKey="useBbSqueeze" description="Detectare comprimare BB" />
            <ToggleRow label="ADX Filter" configKey="useAdx" description="Tendință puternică ADX > prag" />
            <ToggleRow label="OBV Divergence" configKey="useObv" description="Acumulare volum On-Balance" />
            <ToggleRow label="Volume Accumulation" configKey="useVolAccum" description="SMA5 volum > SMA20 * 1.3" />
            <ToggleRow label="Trend Filter (EMA200)" configKey="useTrendFilter" description="Preț > EMA200 pentru long" />
            <ToggleRow label="Noise Filter" configKey="noiseFilter" description="Filtrează perechi cu ATR mic" />
          </section>

          {/* Advanced thresholds */}
          <section className="space-y-3">
            <h3 className="text-xs font-mono uppercase text-muted-foreground border-b border-border pb-1">⚙️ Praguri Avansate</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">ADX Prag ({config.adxThreshold ?? 20})</Label>
                <Input type="number" min="10" max="50" step="5" value={config.adxThreshold ?? 20}
                  onChange={e => set("adxThreshold", Number(e.target.value))} className="bg-secondary" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">RSI Exhaustion ({config.exhaustionRsi ?? 75})</Label>
                <Input type="number" min="60" max="95" step="5" value={config.exhaustionRsi ?? 75}
                  onChange={e => set("exhaustionRsi", Number(e.target.value))} className="bg-secondary" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Volume Spike (x{config.volumeMultiplier ?? 2.5})</Label>
                <Input type="number" min="1.5" max="10" step="0.5" value={config.volumeMultiplier ?? 2.5}
                  onChange={e => set("volumeMultiplier", Number(e.target.value))} className="bg-secondary" />
              </div>
            </div>
          </section>

          <div className="flex gap-2 bg-primary/10 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>Botul scanează la fiecare 60s. Nu deschide duplicate pe aceeași pereche. SL/TP sunt calculate cu precizie completă pentru monede ieftine.</p>
          </div>
        </div>

        <div className="p-4 border-t border-border sticky bottom-0 bg-card">
          <Button className="w-full bg-primary" onClick={onClose}>Salvează Setările</Button>
        </div>
      </div>
    </div>
  );
}