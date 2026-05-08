import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";

async function createSignature(queryString, apiSecret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const msgData = encoder.encode(queryString);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, msgData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchBinanceAccountBalance(apiKey, apiSecret) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await createSignature(queryString, apiSecret);
  
  const response = await fetch(`https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`, {
    headers: {
      'X-MBX-APIKEY': apiKey
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch balance: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    availableBalance: parseFloat(data.availableBalance || 0),
    totalWalletBalance: parseFloat(data.totalWalletBalance || 0),
    totalUnrealizedProfit: parseFloat(data.totalUnrealizedProfit || 0)
  };
}

async function fetchBinancePositions(apiKey, apiSecret) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await createSignature(queryString, apiSecret);
  
  const response = await fetch(`https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
    headers: {
      'X-MBX-APIKEY': apiKey
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch positions');
  }
  
  const data = await response.json();
  return data.filter(p => parseFloat(p.positionAmt) !== 0).map(p => ({
    symbol: p.symbol,
    positionAmt: parseFloat(p.positionAmt),
    entryPrice: parseFloat(p.entryPrice),
    markPrice: parseFloat(p.markPrice),
    unrealizedProfit: parseFloat(p.unRealizedProfit),
    leverage: parseInt(p.leverage),
    positionSide: parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT'
  }));
}

export default function BinanceAccountOverview() {
  const [accountData, setAccountData] = useState(null);
  const [positions, setPositions] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);
  
  const { data: apiKeys = [] } = useQuery({
    queryKey: ['userApiKeys', user?.email],
    queryFn: () => base44.entities.UserApiKey.filter({ created_by: user.email }, "-created_date", 10),
    enabled: !!user,
  });
  
  const activeKey = apiKeys.find(k => k.is_active) || apiKeys[0];
  
  useEffect(() => {
    if (!activeKey) {
      setIsLoading(false);
      return;
    }
    
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const decrypted = await base44.functions.invoke("decryptApiSecret", { keyId: activeKey.id });
        const secret = decrypted.data.secret;
        
        const [balance, openPositions] = await Promise.all([
          fetchBinanceAccountBalance(activeKey.api_key, secret),
          fetchBinancePositions(activeKey.api_key, secret)
        ]);
        
        setAccountData(balance);
        setPositions(openPositions);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [activeKey]);
  
  if (!activeKey) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>No API key:</strong> Configure API keys to view live account data.
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Binance Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <strong>API Error:</strong> {error}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const totalUnrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedProfit, 0);
  const pnlPercent = accountData?.totalWalletBalance ? (totalUnrealizedPnL / accountData.totalWalletBalance) * 100 : 0;
  
  return (
    <div className="space-y-4">
      {/* Account Balance */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-primary to-primary/80 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Wallet className="w-5 h-5" />
            Binance Futures Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm opacity-90">Available Balance</div>
              <div className="text-2xl font-bold">
                ${accountData?.availableBalance?.toFixed(2) || '0.00'}
              </div>
            </div>
            <div>
              <div className="text-sm opacity-90">Total Balance</div>
              <div className="text-2xl font-bold">
                ${accountData?.totalWalletBalance?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Open Positions */}
      {positions.length > 0 && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Open Positions ({positions.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Total P&L:</span>
                <span className={cn(
                  "text-lg font-bold",
                  totalUnrealizedPnL >= 0 ? "text-chart-green" : "text-chart-red"
                )}>
                  {totalUnrealizedPnL >= 0 ? "+" : ""}${totalUnrealizedPnL.toFixed(2)}
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  pnlPercent >= 0 ? "text-chart-green" : "text-chart-red"
                )}>
                  ({pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {positions.map((position, idx) => {
                const pnl = position.unrealizedProfit;
                const pnlColor = pnl >= 0 ? "text-chart-green" : "text-chart-red";
                
                return (
                  <div 
                    key={idx}
                    className={cn(
                      "p-3 rounded-lg border-2",
                      position.positionSide === 'LONG' 
                        ? "border-chart-green/30 bg-chart-green/5" 
                        : "border-chart-red/30 bg-chart-red/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge className={cn(
                          "font-semibold",
                          position.positionSide === 'LONG'
                            ? "bg-chart-green hover:bg-chart-green/90"
                            : "bg-chart-red hover:bg-chart-red/90"
                        )}>
                          {position.positionSide}
                        </Badge>
                        <div>
                          <div className="font-semibold text-foreground">{position.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {Math.abs(position.positionAmt)} @ ${position.entryPrice.toFixed(4)} • {position.leverage}x
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-lg font-bold flex items-center justify-end gap-1", pnlColor)}>
                          {pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Mark: ${position.markPrice.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}