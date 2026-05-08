// Browser-side Binance Futures API client with Web Crypto signing

async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getAccountBalance(apiKey, apiSecret) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await hmacSha256(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`,
    {
      headers: { 'X-MBX-APIKEY': apiKey }
    }
  );
  
  if (!response.ok) throw new Error(`Binance error: ${response.statusText}`);
  return response.json();
}

async function placeOrder(apiKey, apiSecret, params) {
  const timestamp = Date.now();
  const queryString = new URLSearchParams({ ...params, timestamp }).toString();
  const signature = await hmacSha256(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`,
    {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey }
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Binance: ${error.msg || response.statusText}`);
  }
  return response.json();
}

async function cancelOrder(apiKey, apiSecret, symbol, orderId) {
  const timestamp = Date.now();
  const queryString = new URLSearchParams({ symbol, orderId, timestamp }).toString();
  const signature = await hmacSha256(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`,
    {
      method: 'DELETE',
      headers: { 'X-MBX-APIKEY': apiKey }
    }
  );
  
  if (!response.ok) throw new Error(`Binance error: ${response.statusText}`);
  return response.json();
}

async function getOpenOrders(apiKey, apiSecret, symbol = null) {
  const timestamp = Date.now();
  const params = { timestamp };
  if (symbol) params.symbol = symbol;
  
  const queryString = new URLSearchParams(params).toString();
  const signature = await hmacSha256(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/openOrders?${queryString}&signature=${signature}`,
    {
      headers: { 'X-MBX-APIKEY': apiKey }
    }
  );
  
  if (!response.ok) throw new Error(`Binance error: ${response.statusText}`);
  return response.json();
}

async function getUserTrades(apiKey, apiSecret, symbol) {
  const timestamp = Date.now();
  const queryString = new URLSearchParams({ symbol, timestamp }).toString();
  const signature = await hmacSha256(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/userTrades?${queryString}&signature=${signature}`,
    {
      headers: { 'X-MBX-APIKEY': apiKey }
    }
  );
  
  if (!response.ok) throw new Error(`Binance error: ${response.statusText}`);
  return response.json();
}

export { getAccountBalance, placeOrder, cancelOrder, getOpenOrders, getUserTrades };