import React from "react";
import { X, Bot, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AutoTradeSettings({ config, onChange, onClose }) {
  const set = (key, val) => onChange({ ...config, [key]: val });

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

        <div className="p-4 space-y-6">

          {/* Min Pump Score */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Scor Minim Pump</h3>
            <Select value={String(config.minScore)} onValueChange={v => set("minScore", Number(v))}>
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="40">40 - Moderat</SelectItem>
                <SelectItem value="55">55 - Mediu</SelectItem>
                <SelectItem value="70">70 - Ridicat</SelectItem>
                <SelectItem value="85">85 - Foarte Ridicat</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Trade Size */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Valoare Tranzacție (USDT)</h3>
            <Input
              type="number"
              min="10"
              max="10000"
              step="10"
              value={config.tradeSize}
              onChange={e => set("tradeSize", Number(e.target.value))}
              className="bg-secondary"
            />
          </section>

          {/* Max open trades */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Max Poziții Deschise</h3>
            <Select value={String(config.maxOpenTrades)} onValueChange={v => set("maxOpenTrades", Number(v))}>
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Stop Loss */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Stop Loss (%)</h3>
            <Input
              type="number"
              min="1"
              max="20"
              step="0.5"
              value={config.stopLossPct}
              onChange={e => set("stopLossPct", Number(e.target.value))}
              className="bg-secondary"
            />
          </section>

          {/* Take Profit */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Take Profit (%)</h3>
            <Input
              type="number"
              min="1"
              max="100"
              step="1"
              value={config.takeProfitPct}
              onChange={e => set("takeProfitPct", Number(e.target.value))}
              className="bg-secondary"
            />
          </section>

          {/* Timeframe */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Timeframe Analiză</h3>
            <Select value={config.timeframe} onValueChange={v => set("timeframe", v)}>
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">15 minute</SelectItem>
                <SelectItem value="1h">1 oră</SelectItem>
                <SelectItem value="4h">4 ore</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Auto-close options */}
          <section>
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3">Închidere Automată</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">La Take Profit</Label>
                <Switch checked={config.autoTP} onCheckedChange={v => set("autoTP", v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">La Stop Loss</Label>
                <Switch checked={config.autoSL} onCheckedChange={v => set("autoSL", v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">La Scor &lt; 20 (exit semnal)</Label>
                <Switch checked={config.autoExitLowScore} onCheckedChange={v => set("autoExitLowScore", v)} />
              </div>
            </div>
          </section>

          {/* Info */}
          <div className="flex gap-2 bg-primary/10 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>Botul scanează perechile la fiecare 60s și deschide automat tranzacții când scorul depășește pragul setat.</p>
          </div>
        </div>

        <div className="p-4 border-t border-border sticky bottom-0 bg-card">
          <Button className="w-full bg-primary" onClick={onClose}>
            Salvează Setările
          </Button>
        </div>
      </div>
    </div>
  );
}