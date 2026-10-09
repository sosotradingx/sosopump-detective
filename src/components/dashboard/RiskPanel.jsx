import React from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { RISK_LIMITS, atrSizing } from "@/lib/riskFactors";

function readConfig() {
  try {
    return JSON.parse(localStorage.getItem("soso_auto_config") || "{}");
  } catch {
    return {};
  }
}

function Metric({ label, value, sub, bad }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <p className="text-[11px] font-mono text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/80 leading-snug">{sub}</p>}
      </div>
      <p className={`text-xs font-mono font-semibold shrink-0 ${bad ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

// Starea de protecție a contului: kill-switch (pierdere zilnică, serie de pierderi,
// drawdown), expunerea pozițiilor deschise și sizing-ul recomandat pe volatilitate.
export default function RiskPanel({ risk, item }) {
  const cfg = readConfig();
  const tradeSize = cfg.tradeSize || 200;
  const atr = atrSizing({
    atrPct: item?.base?.atrPercent,
    balance: risk?.equity,
    riskPerTradePct: cfg.riskPerTradePct ?? RISK_LIMITS.riskPerTradePct,
  });

  if (!risk) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-chart-green" /> Risc & Protecție
        </h3>
        <p className="text-xs text-muted-foreground mt-2">Se încarcă starea de risc…</p>
      </div>
    );
  }

  const ex = risk.exposure || {};
  const money = (n) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(0)}`;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {risk.blocked
            ? <ShieldAlert className="w-4 h-4 text-destructive" />
            : <ShieldCheck className="w-4 h-4 text-chart-green" />}
          Risc & Protecție
        </h3>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${
          risk.blocked
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : "bg-pump-strong/10 text-pump-strong border-pump-strong/30"
        }`}>
          {risk.blocked ? "KILL-SWITCH ACTIV" : "PROTECȚIE ACTIVĂ"}
        </span>
      </div>

      {risk.blocked && (
        <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded-lg p-2">
          <p className="text-[11px] text-destructive">Fără poziții noi: {risk.reasons.join(" · ")}</p>
        </div>
      )}

      <div className="mt-3">
        <Metric
          label="P&L azi"
          value={money(risk.todayPnl)}
          sub={`limita de oprire -$${risk.dailyLossUsd.toFixed(0)}`}
          bad={risk.flags.daily}
        />
        <Metric
          label="Pierderi consecutive"
          value={`${risk.streak} / ${RISK_LIMITS.maxConsecutiveLosses}`}
          sub="pauză automată la limită"
          bad={risk.flags.streak}
        />
        <Metric
          label="Drawdown din vârf"
          value={`${risk.drawdownPct.toFixed(1)}%`}
          sub={`max ${RISK_LIMITS.maxDrawdownPct}% · vârf $${Math.round(risk.peak)}`}
          bad={risk.flags.drawdown}
        />
        <Metric
          label="Expunere"
          value={`$${Math.round(ex.locked || 0)}`}
          sub={`${ex.count || 0} poziții · ${Math.round(ex.lockedPct || 0)}% din capital${ex.oneDirection ? " · toate long → risc de corelație" : ""}`}
          bad={ex.oneDirection}
        />
        {atr && (
          <Metric
            label={`Sizing ATR · ${item?.symbol || "—"}`}
            value={`$${Math.round(atr.notional)}`}
            sub={`stop 1.5×ATR = ${atr.stopPct.toFixed(1)}% · risc ${cfg.riskPerTradePct ?? RISK_LIMITS.riskPerTradePct}% = $${atr.riskUsd.toFixed(0)} · configurat $${tradeSize}`}
            bad={Math.abs(atr.notional - tradeSize) / tradeSize > 0.5}
          />
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3">
        Kill-switch aplicat automat în bot: -{RISK_LIMITS.dailyLossPct}% într-o zi · {RISK_LIMITS.maxConsecutiveLosses} pierderi la rând · drawdown {RISK_LIMITS.maxDrawdownPct}%.
      </p>
    </div>
  );
}