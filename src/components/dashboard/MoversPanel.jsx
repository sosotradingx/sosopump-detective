import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatPrice, formatVolume } from "@/components/scanner/binanceApi";

function MoverRow({ item, up, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-accent transition-colors">
      <span className="text-left leading-tight min-w-0 flex-1">
        <span className="text-xs font-mono block truncate">{item.symbol.replace("USDT", "")}</span>
        <span className="text-[10px] text-muted-foreground block truncate">
          ${formatPrice(item.price)} · ${formatVolume(item.quoteVolume)}
        </span>
      </span>
      <span className={`text-xs font-mono font-semibold shrink-0 ${up ? "text-pump-strong" : "text-destructive"}`}>
        {up ? "+" : ""}{item.priceChangePercent.toFixed(2)}%
      </span>
    </button>
  );
}

// Top creșteri / scăderi pe 24h din perechile scanate (fără cereri suplimentare).
export default function MoversPanel({ pairs = [], onSelectSymbol }) {
  const scored = pairs.filter(p => typeof p.priceChangePercent === "number");
  const gainers = [...scored].sort((a, b) => b.priceChangePercent - a.priceChangePercent).slice(0, 3);
  const losers = [...scored].sort((a, b) => a.priceChangePercent - b.priceChangePercent).slice(0, 3);

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-sm">📊 Top Mișcări 24h</h3>
      {scored.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aștept datele scanării...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-mono text-pump-strong flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> CREȘTERI
            </p>
            {gainers.map(g => (
              <MoverRow key={g.symbol} item={g} up onClick={() => onSelectSymbol?.(g.symbol)} />
            ))}
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-mono text-destructive flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> SCĂDERI
            </p>
            {losers.map(l => (
              <MoverRow key={l.symbol} item={l} onClick={() => onSelectSymbol?.(l.symbol)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}