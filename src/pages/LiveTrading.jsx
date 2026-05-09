import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Zap, RefreshCw, AlertTriangle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import PlanGate from "@/components/PlanGate";

// Client-side HMAC-SHA256 using Web Crypto API
async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Direct Binance Futures API calls from browser (bypasses server geo-block)
async function binanceFetch(path, apiKey, apiSecret, extraParams = {}, method = 'GET') {
  const params = { ...extraParams, timestamp: Date.now().toString() };
  const qs = new URLSearchParams(params).toString();
  const signature = await hmacSha256(qs, apiSecret);
  const url = `https://fapi.binance.com${path}?${qs}&signature=${signature}`;
  const res = await fetch(url, { method, headers: { 'X-MBX-APIKEY': apiKey } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || `Binance error ${res.status}`);
  return data;
}

export default function LiveTrading() {
  const { isPro, loading: subLoading } = useSubscription();
  const [user, setUser] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [orderDialog, setOrderDialog] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [botLog, setBotLog] = useState("");
  const [positions, setPositions] = useState([]);

  const [orderParams, setOrderParams] = useState({
    symbol: "BTCUSDT",
    side: "BUY",
    quantity: 0.01,
    price: 0
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["userApiKeys", user?.email],
    queryFn: () => base44.entities.UserApiKey.filter({ created_by: user.email }, "-created_date", 10),
    enabled: !!user,
  });

  // When active key changes, fetch credentials from backend once
  useEffect(() => {
    if (apiKeys.length > 0 && !activeKey) {
      const active = apiKeys.find(k => k.is_active) || apiKeys[0];
      setActiveKey(active);
    }
  }, [apiKeys, activeKey]);

  useEffect(() => {
    if (!activeKey) return;
    setCredentials(null);
    base44.functions.invoke("decryptApiSecret", { keyId: activeKey.id })
      .then(res => {
        setCredentials({ apiKey: activeKey.api_key, apiSecret: res.data.secret });
      })
      .catch(e => setBotLog(`❌ Nu s-au putut încărca credențialele: ${e.message}`));
  }, [activeKey]);

  // Fetch balance directly from browser (no server geo-block)
  const fetchBalance = useCallback(async () => {
    if (!credentials) return;
    setLoadingBalance(true);
    try {
      const assets = await binanceFetch('/fapi/v2/balance', credentials.apiKey, credentials.apiSecret);
      console.log('BALANCE RESPONSE:', JSON.stringify(assets));
      const list = Array.isArray(assets) ? assets : [];
      // Find the asset with the highest availableBalance (main margin asset)
      const mainAsset = list.reduce((best, a) => 
        parseFloat(a.availableBalance || 0) > parseFloat(best.availableBalance || 0) ? a : best
      , { availableBalance: "0", balance: "0", asset: "" });
      const availableBalance = parseFloat(mainAsset.availableBalance || 0);
      const totalWallet = parseFloat(mainAsset.balance || 0);
      setBalance({ availableBalance, totalWallet, asset: mainAsset.asset });
    } catch (e) {
      setBotLog(`❌ Balanță: ${e.message}`);
    }
    setLoadingBalance(false);
  }, [credentials]);

  // Fetch positions directly from browser
  const fetchPositions = useCallback(async () => {
    if (!credentials) return;
    try {
      const data = await binanceFetch('/fapi/v2/positionRisk', credentials.apiKey, credentials.apiSecret);
      setPositions((data || []).filter(p => parseFloat(p.positionAmt) !== 0));
    } catch (e) {
      console.error("Positions error:", e.message);
    }
  }, [credentials]);

  // Poll every 15s when credentials are ready
  useEffect(() => {
    if (!credentials) return;
    fetchBalance();
    fetchPositions();
    const interval = setInterval(() => {
      fetchBalance();
      fetchPositions();
    }, 15000);
    return () => clearInterval(interval);
  }, [credentials, fetchBalance, fetchPositions]);

  // Place order directly from browser
  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!credentials) throw new Error("Credențialele nu sunt disponibile");
      setPlacingOrder(true);
      try {
        await binanceFetch('/fapi/v1/order', credentials.apiKey, credentials.apiSecret, {
          symbol: orderParams.symbol,
          side: orderParams.side,
          type: "LIMIT",
          timeInForce: "GTC",
          quantity: orderParams.quantity.toString(),
          price: orderParams.price.toString(),
        }, 'POST');

        setBotLog(`✅ Ordine plasată: ${orderParams.symbol} ${orderParams.side}`);
        setOrderDialog(false);
      } catch (e) {
        setBotLog(`❌ Eroare: ${e.message}`);
        throw e;
      } finally {
        setPlacingOrder(false);
      }
    },
  });

  if (!subLoading && !isPro) {
    return <PlanGate requiredPlan="pro" feature="Live Trading" />;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">⚡ Live Trading</h1>
            <p className="text-sm text-muted-foreground">Tranzacții reale pe Binance Futures</p>
          </div>
        </div>
        {!activeKey && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Lipsă API Key
          </Badge>
        )}
      </div>

      {!activeKey && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          ⚠️ Nu ai nicio cheie API activă. Mergi la <strong>API Keys</strong> pentru a adăuga una.
        </div>
      )}

      {activeKey && !credentials && (
        <div className="bg-secondary/50 border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă credențialele API...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Control Panel */}
        <div className="space-y-4">
          {/* Balance */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-mono text-muted-foreground uppercase">Balanță Binance</p>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={fetchBalance}
                disabled={loadingBalance || !credentials}
              >
                <RefreshCw className={`w-3 h-3 ${loadingBalance ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {balance && balance.availableBalance ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold font-mono">${balance.availableBalance?.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">disponibil {balance.asset} · Total: {balance.totalWallet?.toFixed(2)}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{credentials ? "Se încarcă..." : "—"}</p>
            )}
          </div>

          {/* Place Order */}
          <Dialog open={orderDialog} onOpenChange={setOrderDialog}>
            <DialogTrigger asChild>
              <Button className="w-full bg-primary hover:bg-primary/90">
                <Zap className="w-4 h-4 mr-2" /> Plasează Ordine
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Ordine Nouă</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Pereche</Label>
                  <Input 
                    type="text" 
                    value={orderParams.symbol} 
                    onChange={e => setOrderParams({...orderParams, symbol: e.target.value.toUpperCase()})} 
                    placeholder="BTCUSDT" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Side</Label>
                    <Select value={orderParams.side} onValueChange={v => setOrderParams({...orderParams, side: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUY">BUY</SelectItem>
                        <SelectItem value="SELL">SELL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cantitate</Label>
                    <Input 
                      type="number" 
                      step="0.001" 
                      value={orderParams.quantity} 
                      onChange={e => setOrderParams({...orderParams, quantity: parseFloat(e.target.value) || 0})} 
                    />
                  </div>
                </div>
                <div>
                  <Label>Preț Limit</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={orderParams.price} 
                    onChange={e => setOrderParams({...orderParams, price: parseFloat(e.target.value) || 0})} 
                  />
                </div>
                <Button 
                  onClick={() => placeOrderMutation.mutate()} 
                  disabled={placingOrder || !credentials} 
                  className="w-full bg-pump-strong hover:bg-pump-strong/90"
                >
                  {placingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Plasează
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Log */}
          {botLog && (
            <div className="bg-secondary/50 rounded-lg p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
              {botLog}
            </div>
          )}
        </div>

        {/* Trades Panel */}
        <div className="space-y-4">
          {/* Live Positions */}
          {positions.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Poziții Live ({positions.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left p-3">Pereche</th>
                      <th className="text-right p-3">Qty</th>
                      <th className="text-right p-3">Intrare</th>
                      <th className="text-right p-3">P&L USD</th>
                      <th className="text-right p-3">Liquidare</th>
                      <th className="text-right p-3">Leverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(pos => (
                      <tr key={pos.symbol} className="border-b border-border/40 hover:bg-accent/20">
                        <td className="p-3 font-mono font-bold">{pos.symbol}</td>
                        <td className="p-3 text-right font-mono">{parseFloat(pos.positionAmt || 0).toFixed(3)}</td>
                        <td className="p-3 text-right font-mono">${parseFloat(pos.entryPrice || 0).toFixed(4)}</td>
                        <td className={`p-3 text-right font-mono font-bold ${parseFloat(pos.unRealizedProfit || 0) >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                          {parseFloat(pos.unRealizedProfit || 0) >= 0 ? "+" : ""}{parseFloat(pos.unRealizedProfit || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono">${parseFloat(pos.liquidationPrice || 0).toFixed(4)}</td>
                        <td className="p-3 text-right font-mono">{pos.leverage || "—"}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


        </div>
      </div>
    </div>
  );
}