import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Search, Activity, LineChart, Wallet, Settings, Menu, X,
  Flame, LayoutGrid
} from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { name: "Dashboard", icon: Activity, page: "Dashboard" },
  { name: "Scanner", icon: Search, page: "Scanner" },
  { name: "Multi-Chart", icon: LayoutGrid, page: "MultiChart" },
  { name: "PT Dashboard", icon: Activity, page: "TradingDashboard" },
  { name: "Detalii", icon: LineChart, page: "PairDetail" },
  { name: "Paper Trading", icon: Wallet, page: "PaperTrading" },
  { name: "Configurare", icon: Settings, page: "Config" },
];

export default function Layout({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card/50 backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
              <Flame className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-sm tracking-wide">SOSO PUMP</h1>
              <p className="text-[10px] text-muted-foreground font-mono">DETECTIVE v3.1</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] font-mono text-muted-foreground">BINANCE API</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-pump-strong animate-pulse" />
              <span className="text-xs text-pump-strong">Connected</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">SOSO PUMP</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
        {mobileOpen && (
          <nav className="p-3 border-t border-border space-y-1">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
                  currentPageName === item.page
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:overflow-auto pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
}