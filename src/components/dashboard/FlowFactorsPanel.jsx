import React from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import {
  oiPriceFactor, fundingFactor, liquidationFactor, executionFactor,
  flowSummary, LEVEL_META, LEVEL,
} from "@/lib/flowFactors";

const ICONS = { PASS: CheckCircle2, WARN: AlertTriangle, BLOCK: XCircle };
const COLORS = { PASS: "text-pump-strong", WARN: "text-pump-active", BLOCK: "text-destructive" };

function readTradeSize() {
  try {
    const cfg = JSON.parse(localStorage.getItem("soso_auto_config") || "{}");
    return cfg.tradeSize || 200;
  } catch {
    return 200;
  }
}

// Factori de decizie pentru semnalul principal: OI × preț, funding/crowding,
// lichidări (benzi + cascadă reală) și costul real de execuție.
export default function FlowFactorsPanel({ item, liq }) {
  if (!item) return null;

  const deriv = item.deriv;
  const factors = [
    oiPriceFactor({ oiChangePct: deriv?.oiChangePct, pumpPercent: item.base?.pumpPercent }),
    fundingFactor({ fundingRate: deriv?.fundingRate, longShortRatio: deriv?.longShortRatio }),
    liquidationFactor({ price: item.price, oi: deriv?.oi, liq: liq?.bySymbol?.[item.symbol] }),
    executionFactor({ orderBook: item.ob, price: item.price, tradeSize: readTradeSize() }),
  ];
  const s = flowSummary(factors);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">🌊 Flow & lichiditate · {item.symbol}</h3>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${
          s.blocked
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : "bg-pump-strong/10 text-pump-strong border-pump-strong/30"
        }`}>
          {s.blocked ? "BLOCAT" : `${s.pass}/${factors.length} confirmă`}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {factors.map(f => {
          const Icon = ICONS[f.level] || AlertTriangle;
          const meta = LEVEL_META[f.level] || LEVEL_META.WARN;
          return (
            <div key={f.key} className="flex items-start gap-2">
              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${COLORS[f.level] || COLORS[LEVEL.warn]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono">{f.label}</span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{f.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3">
        Slippage este estimat din spread + adâncimea carnetului; lichidările vin din fluxul live.
      </p>
    </div>
  );
}