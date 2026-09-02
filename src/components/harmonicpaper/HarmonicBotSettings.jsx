import React, { useState } from "react";
import { X, Hexagon, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function HarmonicBotSettings({ config, onChange, onClose }) {
  const [local, setLocal] = useState({ ...config });
  const set = (key, val) => setLocal(prev => ({ ...prev, [key]: val }));

  const handleSave = () => { onChange(local); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border-l border-border h-full w-full max-w-sm overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Hexagon className="w-4 h-4 text-primary" />
            <span className="font-semibold">Setări Bot Harmonic</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-4 space-y-5">
          {/* Portofoliu */}
          <section className="space-y-3">
            <h3 className="text-xs font-mono uppercase text-muted-foreground border-b border-border pb-1">💰 Portofoliu</h3>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Balanță Inițială (USDT)</Label>
              <Input type="number" min="100" max="1000000" step="100" value={local.initialBalance ?? 10000}
                onChange={e => set("initialBalance", Number(e.target.value))} className="bg-secondary" />
              <p className="text-xs text-muted-foreground mt-1">Capitalul virtual de start pentru portofoliul harmonic.</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Suma per Tranzacție (USDT)</Label>
              <Input type="number" min="10" max="10000" step="10" value={local.tradeSize ?? 200}
                onChange={e => set("tradeSize", Number(e.target.value))} className="bg-secondary" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Max Tranzacții Active</Label>
              <Input type="number" min="1" max="50" step="1" value={local.maxOpenTrades ?? 5}
                onChange={e => set("maxOpenTrades", Math.max(1, Number(e.target.value)))} className="bg-secondary" />
            </div>
          </section>

          {/* Scan */}
          <section className="space-y-3">
            <h3 className="text-xs font-mono uppercase text-muted-foreground border-b border-border pb-1">🔍 Scanare</h3>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Timeframe Analiză</Label>
              <Select value={local.timeframe || "1h"} onValueChange={v => set("timeframe", v)}>
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
              <Label className="text-xs text-muted-foreground mb-1 block">Sensibilitate Pivots</Label>
              <Select value={local.sensitivity || "fast"} onValueChange={v => set("sensitivity", v)}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fast">⚡ Fast (mai multe patternuri)</SelectItem>
                  <SelectItem value="normal">⚖️ Normal</SelectItem>
                  <SelectItem value="slow">🐢 Slow (doar majore)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Confidență Minimă ({local.minConf ?? 15}%)</Label>
              <Input type="number" min="5" max="90" step="5" value={local.minConf ?? 15}
                onChange={e => set("minConf", Number(e.target.value))} className="bg-secondary" />
              <p className="text-xs text-muted-foreground mt-1">Sub 15% = multe semnale (zigomot). Peste 40% = doar patternuri foarte clare.</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Perechi Scanate (Top N)</Label>
              <Select value={String(local.scanPairs ?? 30)} onValueChange={v => set("scanPairs", Number(v))}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="30">Top 30</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100</SelectItem>
                  <SelectItem value="0">Toate monedele (~400+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Interval Scanare ({local.scanIntervalMinutes ?? 5} min)</Label>
              <Select value={String(local.scanIntervalMinutes ?? 5)} onValueChange={v => set("scanIntervalMinutes", Number(v))}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 minute</SelectItem>
                  <SelectItem value="5">5 minute</SelectItem>
                  <SelectItem value="10">10 minute</SelectItem>
                  <SelectItem value="15">15 minute</SelectItem>
                  <SelectItem value="30">30 minute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Sursă Piață</Label>
              <Select value={local.marketSource || "perpetuals"} onValueChange={v => set("marketSource", v)}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="perpetuals">🔮 Perpetuals Futures</SelectItem>
                  <SelectItem value="spot">📈 Spot Market</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Exit */}
          <section className="space-y-3">
            <h3 className="text-xs font-mono uppercase text-muted-foreground border-b border-border pb-1">🎯 Ieșire</h3>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Take Profit Target</Label>
              <Select value={local.exitTP || "tp2"} onValueChange={v => set("exitTP", v)}>
                <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tp1">TP1 (1R · conservator)</SelectItem>
                  <SelectItem value="tp2">TP2 (2R · echilibrat)</SelectItem>
                  <SelectItem value="tp3">TP3 (3R · agresiv)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">La care obiectiv se închide poziția. SL vine direct din structura patternului.</p>
            </div>
          </section>

          <div className="flex gap-2 bg-primary/10 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>Botul detectează patternuri harmonice noi la fiecare scanare, le înregistrează ca semnale «pending» și deschide tranzacție DOAR când prețul atinge zona de entry (PRZ). Nu reintră pe patternuri deja detectate.</p>
          </div>
        </div>

        <div className="p-4 border-t border-border sticky bottom-0 bg-card">
          <Button className="w-full bg-primary" onClick={handleSave}>Salvează Setările</Button>
        </div>
      </div>
    </div>
  );
}