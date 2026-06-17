// Binance API client that runs DIRECTLY from browser
// This bypasses geo-restrictions since requests come from user's IP

const FAPI = "https://fapi.binance.com";
const API = "https://api.binance.com";

async function hmac(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signedRequest(apiKey, apiSecret, baseUrl, method, path, params = {}) {
  const timestamp = Date.now().toString();
  const allParams = { ...params, timestamp };
  const qs = new URLSearchParams(allParams).toString();
  const signature = await hmac(qs, apiSecret);
  const url = `${baseUrl}${path}?${qs}&signature=${signature}`;

  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey }
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || `HTTP ${res.status}`);
  return data;
}

// Test connectivity + get account info
export async function testBinanceConnection(apiKey, apiSecret, marketType = 'futures') {
  if (marketType === 'futures') {
    return signedRequest(apiKey, apiSecret, FAPI, 'GET', '/fapi/v2/balance', {});
  } else {
    return signedRequest(apiKey, apiSecret, API, 'GET', '/api/v3/account', {});
  }
}

// Get futures balance (USDC preferred, fallback USDT)
export async function getFuturesBalance(apiKey, apiSecret) {
  const data = await signedRequest(apiKey, apiSecret, FAPI, 'GET', '/fapi/v2/balance', {});
  if (!Array.isArray(data)) return null;
  const usdc = data.find(b => b.asset === 'USDC');
  const usdt = data.find(b => b.asset === 'USDT');
  const bal = usdc || usdt;
  return bal ? {
    availableBalance: parseFloat(bal.availableBalance || 0),
    totalWallet: parseFloat(bal.balance || 0),
    asset: bal.asset
  } : null;
}

// Get open positions
export async function getFuturesPositions(apiKey, apiSecret) {
  const data = await signedRequest(apiKey, apiSecret, FAPI, 'GET', '/fapi/v2/positionRisk', {});
  return Array.isArray(data) ? data.filter(p => parseFloat(p.positionAmt) !== 0) : [];
}

// Get hedge mode setting
export async function getHedgeMode(apiKey, apiSecret) {
  const data = await signedRequest(apiKey, apiSecret, FAPI, 'GET', '/fapi/v1/positionSide/dual', {});
  return data?.dualSidePosition === true;
}

// Place order with optional SL + TP
export async function placeOrderWithSlTp(apiKey, apiSecret, { symbol, side, quantity, stopLoss, takeProfit, hedgeMode }) {
  const closeSide = side === 'BUY' ? 'SELL' : 'BUY';
  const positionSide = side === 'BUY' ? 'LONG' : 'SHORT';
  const closePosParams = hedgeMode
    ? { positionSide: positionSide === 'LONG' ? 'SHORT' : 'LONG', quantity: quantity.toString() }
    : { reduceOnly: 'true', quantity: quantity.toString() };
  const baseParams = hedgeMode ? { positionSide } : {};

  // 1. Main MARKET order
  const mainData = await signedRequest(apiKey, apiSecret, FAPI, 'POST', '/fapi/v1/order', {
    symbol, side, type: 'MARKET', quantity: quantity.toString(), ...baseParams
  });

  const results = { mainOrder: mainData, slOrder: null, tpOrder: null, slError: null, tpError: null };

  // 2. Stop Loss - try standard endpoint first, fallback to Algo API
  if (stopLoss > 0) {
    try {
      const slParams = { symbol, side: closeSide, type: 'STOP_MARKET', stopPrice: stopLoss.toString(), closePosition: 'true' };
      if (hedgeMode) { delete slParams.closePosition; slParams.positionSide = positionSide; slParams.quantity = quantity.toString(); }
      results.slOrder = await signedRequest(apiKey, apiSecret, FAPI, 'POST', '/fapi/v1/order', slParams);
    } catch (e1) {
      // Fallback: Algo Order API (for USDC-M futures)
      try {
        const algoSlParams = { symbol, side: closeSide, orderType: 'STP', stopPrice: stopLoss.toString(), quantity: quantity.toString() };
        if (hedgeMode) algoSlParams.positionSide = positionSide;
        results.slOrder = await signedRequest(apiKey, apiSecret, FAPI, 'POST', '/fapi/v1/order/algo', algoSlParams);
      } catch (e2) { results.slError = e2.message; }
    }
  }

  // 3. Take Profit - try standard endpoint first, fallback to Algo API
  if (takeProfit > 0) {
    try {
      const tpParams = { symbol, side: closeSide, type: 'TAKE_PROFIT_MARKET', stopPrice: takeProfit.toString(), closePosition: 'true' };
      if (hedgeMode) { delete tpParams.closePosition; tpParams.positionSide = positionSide; tpParams.quantity = quantity.toString(); }
      results.tpOrder = await signedRequest(apiKey, apiSecret, FAPI, 'POST', '/fapi/v1/order', tpParams);
    } catch (e1) {
      // Fallback: Algo Order API (for USDC-M futures)
      try {
        const algoTpParams = { symbol, side: closeSide, orderType: 'TTP', stopPrice: takeProfit.toString(), quantity: quantity.toString() };
        if (hedgeMode) algoTpParams.positionSide = positionSide;
        results.tpOrder = await signedRequest(apiKey, apiSecret, FAPI, 'POST', '/fapi/v1/order/algo', algoTpParams);
      } catch (e2) { results.tpError = e2.message; }
    }
  }

  return results;
}

// Close position (market order reduceOnly)
export async function closePosition(apiKey, apiSecret, symbol, positionAmt, hedgeMode) {
  const qty = Math.abs(parseFloat(positionAmt));
  const side = parseFloat(positionAmt) > 0 ? 'SELL' : 'BUY';
  const params = { symbol, side, type: 'MARKET', quantity: qty.toString() };
  if (hedgeMode) {
    params.positionSide = parseFloat(positionAmt) > 0 ? 'LONG' : 'SHORT';
  } else {
    params.reduceOnly = 'true';
  }
  return signedRequest(apiKey, apiSecret, FAPI, 'POST', '/fapi/v1/order', params);
}

// Cancel all open orders for a symbol
export async function cancelAllOrders(apiKey, apiSecret, symbol) {
  return signedRequest(apiKey, apiSecret, FAPI, 'DELETE', '/fapi/v1/allOpenOrders', { symbol });
}

// Get open orders
export async function getOpenOrders(apiKey, apiSecret, symbol) {
  const params = symbol ? { symbol } : {};
  return signedRequest(apiKey, apiSecret, FAPI, 'GET', '/fapi/v1/openOrders', params);
}