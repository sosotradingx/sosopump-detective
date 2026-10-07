import React from "react";
import { ShieldAlert, TrendingUp, Activity, Layers } from "lucide-react";

const Row = ({ label, value, tone }) => (
  <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={`text-[11px] font-mono ${tone || "text-foreground"}`}>{value}</span>
  </div>
);

export default function AdvancedPanel({ sig, micro, base, deriv, book, mtf }) {
  const tone = (v, good = 1, bad = -1) =>
    v == null ? "text-muted-foreground" : v >= good ? "text-chart-green" : v <= bad ? "text-destructive" : "text-foreground";

  const cascade = [
    { tf: "5m", role: "trigger", active: !!mtf?.trigger },
    { tf: "15m", role: "confirmare", active: !!mtf?.confirm },
    { tf: "1h", role: "context", active: !!sig?.contextOk },
    { tf: "4h", role: "context", active: !!sig?.aligned4h },
  ];

  return (
    <div className="space-y-4">
      {/* Two-axis score */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-mono text-muted-foreground">SCOR PE DOUĂ AXE</h3>
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> PUMP STRENGTH</span>
            <span className="text-foreground font-bold">{sig?.strength ?? 0}%</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-pump-strong rounded-full" style={{ width: `${sig?.strength ?? 0}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> MANIPULATION PROBABILITY</span>
            <span className="text-foreground font-bold">{sig?.manipulation ?? 0}%</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-destructive rounded-full" style={{ width: `${sig?.manipulation ?? 0}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap pt-1">
          <Layers className="w-3 h-3 text-muted-foreground" />
          {cascade.map(c => (
            <span key={c.tf} className={`text-[10px] px-2 py-0.5 rounded font-mono ${
              c.active ? "bg-chart-green/20 text-chart-green" : "bg-secondary text-muted-foreground"
            }`}>
              {c.active ? "✓" : "○"} {c.tf} · {c.role}
            </span>
          ))}
        </div>
        {sig?.reasons?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sig.reasons.slice(0, 6).map((r, i) => (
              <span key={i} className="text-[10px] bg-chart-blue/15 text-chart-blue px-2 py-0.5 rounded">{r}</span>
            ))}
          </div>
        )}
      </div>

      {/* Derivatives */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-mono text-muted-foreground mb-2">DERIVATE (OI · FUNDING · POZIȚIONARE)</h3>
        <Row label="Open Interest Δ 1h" value={deriv?.oiChangePct != null ? `${deriv.oiChangePct >= 0 ? "+" : ""}${deriv.oiChangePct.toFixed(2)}%` : "indisponibil"} tone={tone(deriv?.oiChangePct, 2, -2)} />
        <Row label="Funding rate (8h)" value={deriv?.fundingRate != null ? `${deriv.fundingRate.toFixed(4)}%` : "indisponibil"} tone={deriv?.fundingRate >= 0.1 ? "text-destructive" : deriv?.fundingRate >= 0.05 ? "text-pump-active" : "text-foreground"} />
        <Row label="Long/Short ratio" value={deriv?.longShortRatio != null ? deriv.longShortRatio.toFixed(2) : "indisponibil"} />
        <Row label="Volum perp / spot" value={deriv?.perpSpotRatio != null ? `${deriv.perpSpotRatio.toFixed(1)}×` : "—"} tone={deriv?.perpSpotRatio >= 10 ? "text-destructive" : "text-foreground"} />
        <Row label="Taker buy ratio (20 bare)" value={micro?.takerBuyRatio != null ? `${(micro.takerBuyRatio * 100).toFixed(1)}%` : "doar Binance"} tone={tone(micro?.takerBuyRatio, 0.55, 0.45)} />
        <Row label="CVD (20 bare)" value={micro?.cvdRising == null ? "doar Binance" : micro.cvdRising ? "în creștere" : "în scădere"} tone={micro?.cvdRising ? "text-chart-green" : "text-destructive"} />
      </div>

      {/* Microstructure */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-mono text-muted-foreground mb-2">MICROSTRUCTURĂ & NORMALIZARE</h3>
        <Row label="Volum z-score" value={micro?.volumeZ ?? "—"} tone={tone(micro?.volumeZ, 2, 0)} />
        <Row label="Volum vs aceeași oră (z)" value={micro?.seasonalZ ?? "—"} tone={tone(micro?.seasonalZ, 1.5, 0)} />
        <Row label="Return z-score" value={micro?.retZ ?? "—"} />
        <Row label="BB width percentilă" value={micro?.bbWidthPct != null ? `${micro.bbWidthPct}%` : "—"} tone={micro?.bbWidthPct <= 12 ? "text-pump-early" : "text-foreground"} />
        <Row label="Absorbție (volum fără mișcare)" value={micro?.absorption ? "DA" : "nu"} tone={micro?.absorption ? "text-chart-green" : undefined} />
        <Row label="Amihud (impact / $1M)" value={micro?.amihud != null ? `${micro.amihud}%` : "—"} tone={micro?.amihud >= 0.8 ? "text-destructive" : "text-foreground"} />
        <Row label="Dezechilibru order book ±2%" value={book?.imbalance != null ? `${(book.imbalance * 100).toFixed(1)}% bid` : "—"} tone={book?.imbalance >= 0.7 || book?.imbalance <= 0.3 ? "text-destructive" : "text-foreground"} />
        <Row label="Distanță față de EMA21" value={micro?.distAtr21 != null ? `${micro.distAtr21}× ATR` : "—"} tone={micro?.distAtr21 >= 3 ? "text-destructive" : "text-foreground"} />
        <Row label="Tranzacție medie" value={micro?.avgTradeNotional != null ? `$${micro.avgTradeNotional.toLocaleString("ro-RO")}` : "indisponibil"} />
        <Row label="Alpha vs BTC (1h)" value={sig?.alpha1h != null ? `${sig.alpha1h >= 0 ? "+" : ""}${sig.alpha1h}%` : "—"} tone={tone(sig?.alpha1h, 0.5, 0.5)} />
        <Row label="Scor motor 1h" value={base?.totalScore ?? "—"} />
      </div>

      {/* Dump risk */}
      {sig?.dumpFactors?.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/25 rounded-xl p-4">
          <h3 className="text-xs font-mono text-destructive mb-2 flex items-center gap-2">
            <Activity className="w-3 h-3" /> ☠️ FAZA DE DISTRIBUȚIE
          </h3>
          {sig.dumpFactors.map((f, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">• {f}</p>
          ))}
        </div>
      )}

      {sig?.manipReasons?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs font-mono text-muted-foreground mb-2">INDICII DE MANIPULARE</h3>
          {sig.manipReasons.map((f, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">• {f}</p>
          ))}
        </div>
      )}
    </div>
  );
}