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

// Place MARKET order only (SL/TP handled via backend to avoid CORS on Algo endpoints)
export async function placeMarketOrder(apiKey, apiSecret, { symbol, side, quantity, hedgeMode }) {
  const positionSide = side === 'BUY' ? 'LONG' : 'SHORT';
  const baseParams = hedgeMode ? { positionSide } : {};
  return signedRequest(apiKey, apiSecret, FAPI, 'POST', '/fapi/v1/order', {
    symbol, side, type: 'MARKET', quantity: quantity.toString(), ...baseParams
  });
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