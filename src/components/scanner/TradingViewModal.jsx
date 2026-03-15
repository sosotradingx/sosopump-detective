import React from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TradingViewModal({ symbol, onClose }) {
  if (!symbol) return null;

  const tvSymbol = `BINANCE:${symbol}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-5xl mx-4 overflow-hidden"
        style={{ height: "80vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="font-bold font-mono text-lg">{symbol.replace("USDT", "")}/USDT</span>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">TradingView</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://www.tradingview.com/chart/?symbol=${tvSymbol}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="w-4 h-4 mr-1" /> Deschide TradingView
              </Button>
            </a>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* TradingView Widget */}
        <iframe
          src={`https://s.tradingview.com/widgetembed/?symbol=${tvSymbol}&interval=1H&theme=dark&style=1&locale=ro&toolbar_bg=%23131722&enable_publishing=false&hide_top_toolbar=false&hide_legend=false&save_image=false&container_id=tv_widget`}
          style={{ width: "100%", height: "calc(100% - 57px)", border: "none" }}
          allowTransparency={true}
          scrolling="no"
          allowFullScreen={true}
        />
      </div>
    </div>
  );
}