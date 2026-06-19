import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search, Activity, Zap, Bot, BarChart2, Shield, ChevronRight,
  Check, Star, Crown, TrendingUp, LineChart, Bell, Key,
  ArrowRight, Globe, Clock, Lock, Menu, X
} from "lucide-react";

const FEATURES = [
  {
    icon: Search,
    title: "Real-Time Pump Scanner",
    desc: "Scan 100+ Binance Futures pairs simultaneously. Detect early pump signals before they explode using multi-timeframe analysis.",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
  {
    icon: BarChart2,
    title: "Paper Trading Dashboard",
    desc: "Practice your strategy risk-free with a virtual portfolio. Full analytics, entry/exit tracking and performance metrics.",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  {
    icon: LineChart,
    title: "Advanced Backtesting",
    desc: "Test your pump-detection strategy on historical data. Optimize parameters to maximize win rate and returns.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: Zap,
    title: "Live Trading Engine",
    desc: "Execute real Binance Futures trades directly from your browser using your API keys. SL/TP orders placed automatically.",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
  },
  {
    icon: Bot,
    title: "Auto-Trading Bot",
    desc: "Fully automated pump-detection bot with configurable score thresholds, risk management, and auto exit conditions.",
    color: "text-pump-strong",
    bg: "bg-pump-strong/10",
  },
  {
    icon: Bell,
    title: "Email Alerts",
    desc: "Receive instant email notifications when a pump signal meets your criteria. Never miss a trade opportunity.",
    color: "text-pink-400",
    bg: "bg-pink-400/10",
  },
];

const INDICATORS = [
  "MACD Confirmation", "Bollinger Band Squeeze", "ADX Filter",
  "OBV Divergence", "Volume Accumulation", "RSI Exhaustion",
  "Trend Filter (EMA)", "VWAP Accumulation", "Multi-TF Confirmation",
];

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    color: "border-border",
    features: ["Top 50 pairs scanner", "Live Dashboard", "Watchlist", "Basic Paper Trading"],
    locked: ["Backtesting", "Multi-Chart", "Live Trading", "Auto-Bot"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$50",
    period: "/month",
    popular: true,
    icon: Star,
    color: "border-primary/60",
    ringColor: "ring-primary/30",
    iconColor: "text-primary",
    features: ["Full Scanner (all pairs)", "Advanced Paper Trading", "Backtesting", "Multi-Chart", "Email Alerts", "Export Reports"],
    locked: ["Live Trading", "Auto-Bot Real"],
  },
  {
    key: "elite",
    name: "Elite",
    price: "$100",
    period: "/month",
    icon: Crown,
    color: "border-yellow-500/60",
    ringColor: "ring-yellow-500/20",
    iconColor: "text-yellow-400",
    features: ["Everything in Pro", "Live Trading on Binance", "Auto-Bot (real funds)", "API Key Management", "Priority Support", "Beta Features Access"],
    locked: [],
  },
];

const FAQS = [
  {
    q: "How does the pump scanner work?",
    a: "Our engine analyzes price action, volume spikes, MACD, OBV, ADX, and Bollinger Bands across multiple timeframes to assign a 0-100 pump score to each pair in real-time."
  },
  {
    q: "Is my Binance API key safe?",
    a: "Yes. Your API keys are encrypted at rest and never stored in plain text. Live orders are executed directly from your browser, so your keys never pass through our servers."
  },
  {
    q: "Can I try it for free?",
    a: "Absolutely. The Free plan gives you access to the live scanner (top 50 pairs), dashboard, and basic paper trading — no credit card required."
  },
  {
    q: "How do I pay for a subscription?",
    a: "We accept USDC on BEP20 (Binance Smart Chain). Send the exact amount to our wallet, submit your TX hash, and your plan is activated within 24 hours."
  },
  {
    q: "Does the Auto-Bot work 24/7?",
    a: "The bot runs while your browser tab is open. It scans for signals on your chosen timeframe and executes trades automatically based on your configured thresholds."
  },
];

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const handleLogin = () => base44.auth.redirectToLogin(window.location.origin + "/Dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img
              src="https://media.base44.com/images/public/69b1ed87d348d325856ccd73/f4bcf56fd_image.png"
              alt="SOSO Logo"
              className="w-9 h-9 rounded-xl object-cover"
            />
            <div>
              <span className="font-bold text-sm tracking-wide">SOSO PUMP</span>
              <span className="block text-[10px] font-mono text-muted-foreground">DETECTIVE v3.1</span>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleLogin}>Sign In</Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={handleLogin}>
              Get Started Free <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>

          <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-card border-t border-border px-4 py-4 space-y-3">
            {["features", "how-it-works", "pricing", "faq"].map(s => (
              <a key={s} href={`#${s}`} onClick={() => setMobileMenuOpen(false)}
                className="block capitalize text-sm text-muted-foreground hover:text-foreground py-2">
                {s.replace("-", " ")}
              </a>
            ))}
            <Button className="w-full bg-primary" onClick={handleLogin}>Get Started Free</Button>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="pt-32 pb-20 px-4 text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto relative">
          <Badge className="mb-6 bg-primary/10 text-primary border-primary/30 text-xs px-3 py-1">
            <Activity className="w-3 h-3 mr-1 inline" /> Real-time Binance Futures Intelligence
          </Badge>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Detect Crypto Pumps{" "}
            <span className="text-primary">Before</span>{" "}
            They Happen
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            SOSO Pump Detective scans Binance Futures in real-time, scores every pair with 9 technical indicators, and alerts you the moment a pump signal appears — so you can trade it first.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-base px-8 font-semibold"
              onClick={handleLogin}
            >
              <Zap className="w-4 h-4 mr-2" /> Start for Free
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8" onClick={() => document.getElementById("features").scrollIntoView({ behavior: "smooth" })}>
              See Features <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-6 justify-center mt-12 text-sm text-muted-foreground">
            {[
              { icon: Globe, label: "100+ Pairs Scanned" },
              { icon: Clock, label: "Real-Time Updates" },
              { icon: Lock, label: "API Keys Encrypted" },
              { icon: Shield, label: "No KYC Required" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS TICKER */}
      <section className="border-y border-border/50 bg-card/30 py-6 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "9", label: "Technical Indicators" },
            { value: "100+", label: "Pairs Analyzed" },
            { value: "5", label: "Timeframes" },
            { value: "24/7", label: "Auto-Bot Ready" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-3xl font-bold text-primary font-mono">{value}</p>
              <p className="text-sm text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Everything You Need to Trade Pumps</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">From early signal detection to automated execution — all in one platform.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-card border border-border rounded-xl p-6 hover:border-border/80 transition-all group">
                <div className={`w-11 h-11 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INDICATORS */}
      <section className="py-16 px-4 bg-card/20 border-y border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Powered by 9 Technical Indicators</h2>
            <p className="text-muted-foreground text-sm">Each pair receives a composite 0–100 pump score calculated from:</p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            {INDICATORS.map(ind => (
              <span key={ind} className="bg-secondary border border-border rounded-lg px-4 py-2 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors">
                {ind}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">How It Works</h2>
            <p className="text-muted-foreground">From signal to trade in seconds</p>
          </div>
          <div className="space-y-8">
            {[
              {
                step: "01",
                title: "Connect Your Binance Account",
                desc: "Add your Binance Futures API key (read-only for scanning, trade-enabled for live trading). Keys are AES-encrypted and never leave our secure storage.",
                icon: Key,
                color: "text-blue-400",
              },
              {
                step: "02",
                title: "Scanner Detects Pump Signals",
                desc: "Our engine continuously scans 100+ perpetual futures pairs, applying 9 indicators across 5 timeframes to compute a pump score in real time.",
                icon: Search,
                color: "text-primary",
              },
              {
                step: "03",
                title: "Get Alerted or Let the Bot Trade",
                desc: "Receive instant email alerts when a pair crosses your score threshold — or turn on Auto-Bot to execute trades automatically with your configured SL/TP.",
                icon: Bot,
                color: "text-pump-strong",
              },
              {
                step: "04",
                title: "Track Performance",
                desc: "Monitor all open positions, realized PnL history, and paper trading results in a clean dashboard with full export capabilities.",
                icon: TrendingUp,
                color: "text-yellow-400",
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center">
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-mono text-muted-foreground">{item.step}</span>
                    <h3 className="font-semibold text-base">{item.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20 px-4 bg-card/20 border-y border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground">Paid in <strong className="text-foreground">USDC on BEP20</strong> · Activated within 24 hours</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map(plan => (
              <div
                key={plan.key}
                className={`bg-card border-2 ${plan.color} rounded-xl p-6 flex flex-col relative ${plan.popular ? `ring-2 ${plan.ringColor}` : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-3">Most Popular</Badge>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-4">
                  {plan.icon && <plan.icon className={`w-5 h-5 ${plan.iconColor}`} />}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className={`w-4 h-4 flex-shrink-0 ${plan.iconColor || "text-pump-strong"}`} /> {f}
                    </li>
                  ))}
                  {plan.locked.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground/40 line-through">
                      <Check className="w-4 h-4 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full ${plan.key === "free" ? "" : plan.key === "pro" ? "bg-primary hover:bg-primary/90" : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 hover:bg-yellow-500/30"}`}
                  variant={plan.key === "free" ? "outline" : "default"}
                  onClick={handleLogin}
                >
                  {plan.key === "free" ? "Get Started Free" : `Choose ${plan.name}`}
                </Button>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            Discounts available: 3 months (−14%) · 6 months (−27%) · Payment via USDC BEP20 · <Link to="/Pricing" className="text-primary hover:underline">View full pricing details</Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                <button
                  className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-accent/30 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-sm">{faq.q}</span>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${openFaq === i ? "rotate-90" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="py-20 px-4 border-t border-border/40">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-10 space-y-6">
            <h2 className="text-3xl font-bold">Start Detecting Pumps Today</h2>
            <p className="text-muted-foreground">Join traders using SOSO Pump Detective to get ahead of the market. Free plan, no credit card required.</p>
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-base px-10 font-semibold"
              onClick={handleLogin}
            >
              <Zap className="w-4 h-4 mr-2" /> Create Free Account
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/40 py-8 px-4 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-3 mb-3">
          <img
            src="https://media.base44.com/images/public/69b1ed87d348d325856ccd73/f4bcf56fd_image.png"
            alt="SOSO Logo"
            className="w-6 h-6 rounded object-cover"
          />
          <span className="font-bold text-sm text-foreground">SOSO PUMP DETECTIVE</span>
        </div>
        <p>© 2026 SOSO Pump Detective · Trading crypto involves significant risk · Not financial advice</p>
        <div className="flex gap-4 justify-center mt-3">
          <Link to="/Dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
          <Link to="/Pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          <button onClick={handleLogin} className="hover:text-foreground transition-colors">Sign In</button>
        </div>
      </footer>
    </div>
  );
}