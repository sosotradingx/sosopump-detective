import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, RotateCcw, Loader2, Settings, Zap, Activity, Shield, Eye, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CONFIG = {
  name: "Default",
  pump_threshold: 15, volume_multiplier: 2.5, lookback_bars: 20,
  adaptive_lookback: true, inactive_timeout: 50, require_2tf_confirmation: true,
  tf_current: "1h", tf_mid: "4h", tf_high: "1d", tf_low: "15m",
  enable_early_detection: true, use_volume_accumulation: true, vol_accum_threshold: 1.3,
  require_breakout: true, use_macd_confirmation: true, use_bullish_divergence: false,
  use_obv_divergence: true, use_bb_squeeze: true, use_adx_filter: true,
  use_stoch_divergence: false, use_vwap_accumulation: true, use_trend_filter: true,
  obv_lookback: 14, bb_length: 20, bb_mult: 2.0, bb_squeeze_threshold: 0.8,
  adx_threshold: 20, stoch_length: 14,
  enable_take_profit: true, take_profit_level: 30,
  enable_stop_loss: true, stop_loss_level: 5,
  volume_fade_threshold: 0.5, noise_filter: true, noise_threshold: 0.5,
  use_market_regime: true, exhaustion_rsi: 75, volume_decline_threshold: 0.7,
  price_retrace_threshold: 10, max_pairs: 50, refresh_interval: 30,
  quote_asset: "USDT", min_volume_24h: 1000000
};

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

function SliderField({ label, value, onChange, min, max, step, unit = "" }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-mono text-primary">{value}{unit}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step} className="[&>span>span]:bg-primary" />
    </div>
  );
}

function ToggleField({ label, checked, onCheckedChange, description }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Label className="text-xs">{label}</Label>
        {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function Config() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [user, setUser] = useState(null);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: configs = [] } = useQuery({
    queryKey: ["scanner-config", user?.email],
    queryFn: () => base44.entities.ScannerConfig.filter({ created_by: user.email }, "-created_date", 1),
    enabled: !!user,
  });

  useEffect(() => {
    if (configs.length > 0) {
      setConfig({ ...DEFAULT_CONFIG, ...configs[0] });
    }
  }, [configs]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (configs.length > 0) {
        return base44.entities.ScannerConfig.update(configs[0].id, data);
      }
      return base44.entities.ScannerConfig.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scanner-config"] });
      toast.success("Configurare salvată!");
    },
  });

  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚙️ Configurare</h1>
          <p className="text-sm text-muted-foreground">Parametrii SOSO PUMP Detective v3.1</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfig(DEFAULT_CONFIG)}>
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button onClick={() => saveMutation.mutate(config)} disabled={saveMutation.isPending} className="bg-primary">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvează
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Section icon={Settings} title="Pump Parameters">
            <SliderField label="Min Pump %" value={config.pump_threshold} onChange={v => set("pump_threshold", v)} min={5} max={100} step={1} unit="%" />
            <SliderField label="Volume Multiplier" value={config.volume_multiplier} onChange={v => set("volume_multiplier", v)} min={1.5} max={5} step={0.1} unit="x" />
            <SliderField label="Lookback Bars" value={config.lookback_bars} onChange={v => set("lookback_bars", v)} min={10} max={50} step={1} />
            <ToggleField label="Adaptive Lookback" checked={config.adaptive_lookback} onCheckedChange={v => set("adaptive_lookback", v)} />
            <SliderField label="Inactive Timeout" value={config.inactive_timeout} onChange={v => set("inactive_timeout", v)} min={20} max={200} step={5} unit=" bars" />
            <ToggleField label="Require 2 TF Confirmation" checked={config.require_2tf_confirmation} onCheckedChange={v => set("require_2tf_confirmation", v)} />
          </Section>

          <Section icon={Activity} title="Multi-Timeframe">
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "tf_low", label: "Low TF" },
                { key: "tf_current", label: "Current TF" },
                { key: "tf_mid", label: "Mid TF" },
                { key: "tf_high", label: "High TF" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Select value={config[key]} onValueChange={v => set(key, v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["1m", "5m", "15m", "30m", "1h", "4h", "1d"].map(tf => (
                        <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={BarChart3} title="Scanner">
            <SliderField label="Max Pairs" value={config.max_pairs} onChange={v => set("max_pairs", v)} min={10} max={200} step={10} />
            <SliderField label="Refresh Interval" value={config.refresh_interval} onChange={v => set("refresh_interval", v)} min={10} max={120} step={5} unit="s" />
            <div>
              <Label className="text-xs">Quote Asset</Label>
              <Select value={config.quote_asset} onValueChange={v => set("quote_asset", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="BTC">BTC</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SliderField label="Min Volume 24h" value={config.min_volume_24h / 1000000} onChange={v => set("min_volume_24h", v * 1000000)} min={0.1} max={100} step={0.1} unit="M $" />
          </Section>
        </div>

        <div className="space-y-6">
          <Section icon={Zap} title="Early Detection">
            <ToggleField label="Enable Early Detection" checked={config.enable_early_detection} onCheckedChange={v => set("enable_early_detection", v)} />
            <ToggleField label="Volume Accumulation" checked={config.use_volume_accumulation} onCheckedChange={v => set("use_volume_accumulation", v)} />
            {config.use_volume_accumulation && (
              <SliderField label="Vol Accum Threshold" value={config.vol_accum_threshold} onChange={v => set("vol_accum_threshold", v)} min={1} max={2} step={0.1} unit="x" />
            )}
            <ToggleField label="Require EMA Breakout" checked={config.require_breakout} onCheckedChange={v => set("require_breakout", v)} />
            <ToggleField label="MACD Confirmation" checked={config.use_macd_confirmation} onCheckedChange={v => set("use_macd_confirmation", v)} />
            <ToggleField label="RSI Divergence" checked={config.use_bullish_divergence} onCheckedChange={v => set("use_bullish_divergence", v)} />
            <ToggleField label="OBV Divergence" checked={config.use_obv_divergence} onCheckedChange={v => set("use_obv_divergence", v)} />
            <ToggleField label="BB Squeeze" checked={config.use_bb_squeeze} onCheckedChange={v => set("use_bb_squeeze", v)} />
            <ToggleField label="ADX Filter" checked={config.use_adx_filter} onCheckedChange={v => set("use_adx_filter", v)} />
            <ToggleField label="Stochastic Divergence" checked={config.use_stoch_divergence} onCheckedChange={v => set("use_stoch_divergence", v)} />
            <ToggleField label="VWAP Accumulation" checked={config.use_vwap_accumulation} onCheckedChange={v => set("use_vwap_accumulation", v)} />
            <ToggleField label="Trend Filter (EMA 200)" checked={config.use_trend_filter} onCheckedChange={v => set("use_trend_filter", v)} />
          </Section>

          <Section icon={Shield} title="Exit & Risk">
            <ToggleField label="Take Profit" checked={config.enable_take_profit} onCheckedChange={v => set("enable_take_profit", v)} />
            {config.enable_take_profit && (
              <SliderField label="Take Profit Level" value={config.take_profit_level} onChange={v => set("take_profit_level", v)} min={10} max={100} step={5} unit="%" />
            )}
            <ToggleField label="Stop Loss" checked={config.enable_stop_loss} onCheckedChange={v => set("enable_stop_loss", v)} />
            {config.enable_stop_loss && (
              <SliderField label="Stop Loss Level" value={config.stop_loss_level} onChange={v => set("stop_loss_level", v)} min={2} max={15} step={1} unit="%" />
            )}
            <SliderField label="Volume Fade Threshold" value={config.volume_fade_threshold} onChange={v => set("volume_fade_threshold", v)} min={0.3} max={0.8} step={0.1} unit="x" />
            <SliderField label="Exhaustion RSI" value={config.exhaustion_rsi} onChange={v => set("exhaustion_rsi", v)} min={70} max={90} step={1} />
            <SliderField label="Volume Decline" value={config.volume_decline_threshold} onChange={v => set("volume_decline_threshold", v)} min={0.3} max={0.9} step={0.05} />
            <SliderField label="Price Retrace" value={config.price_retrace_threshold} onChange={v => set("price_retrace_threshold", v)} min={5} max={30} step={1} unit="%" />
          </Section>

          <Section icon={Eye} title="Filter">
            <ToggleField label="Noise Filter" checked={config.noise_filter} onCheckedChange={v => set("noise_filter", v)} />
            {config.noise_filter && (
              <SliderField label="Noise Threshold" value={config.noise_threshold} onChange={v => set("noise_threshold", v)} min={0.2} max={1.5} step={0.1} unit="%" />
            )}
            <ToggleField label="Market Regime Detection" checked={config.use_market_regime} onCheckedChange={v => set("use_market_regime", v)} />
          </Section>

          <Section icon={Settings} title="Advanced Parameters">
            <SliderField label="OBV Lookback" value={config.obv_lookback} onChange={v => set("obv_lookback", v)} min={5} max={30} step={1} />
            <SliderField label="BB Length" value={config.bb_length} onChange={v => set("bb_length", v)} min={10} max={50} step={1} />
            <SliderField label="BB Std Dev" value={config.bb_mult} onChange={v => set("bb_mult", v)} min={1.5} max={3} step={0.1} />
            <SliderField label="BB Squeeze Threshold" value={config.bb_squeeze_threshold} onChange={v => set("bb_squeeze_threshold", v)} min={0.5} max={0.9} step={0.05} />
            <SliderField label="ADX Threshold" value={config.adx_threshold} onChange={v => set("adx_threshold", v)} min={15} max={30} step={1} />
            <SliderField label="Stochastic Length" value={config.stoch_length} onChange={v => set("stoch_length", v)} min={7} max={21} step={1} />
          </Section>
        </div>
      </div>
    </div>
  );
}