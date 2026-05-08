import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, keyId, params } = await req.json();

    // Get API key
    const apiKey = await base44.entities.UserApiKey.filter(
      { id: keyId, created_by: user.email },
      '-created_date',
      1
    );

    if (apiKey.length === 0) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }

    const key = apiKey[0];
    const decrypted = await base44.functions.invoke('decryptApiSecret', { keyId: keyId });
    const apiSecret = decrypted.data.secret;

    let url = '';
    let method = 'GET';
    let queryString = '';

    // Build request based on action
    switch (action) {
      case 'getBalance': {
        const now = Date.now();
        queryString = new URLSearchParams({ timestamp: now.toString() }).toString();
        const signature = await hmacSha256(queryString, apiSecret);
        url = `https://fapi.binance.com/fapi/v1/account?${queryString}&signature=${signature}`;
        break;
      }

      case 'getTickerPrice':
        url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${params.symbol}`;
        break;

      case 'placeOrder':
        method = 'POST';
        queryString = new URLSearchParams({ 
          ...params, 
          timestamp: Date.now().toString() 
        }).toString();
        url = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${await hmacSha256(queryString, apiSecret)}`;
        break;

      case 'cancelOrder':
        method = 'DELETE';
        queryString = new URLSearchParams({ 
          symbol: params.symbol,
          orderId: params.orderId,
          timestamp: Date.now().toString() 
        }).toString();
        url = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${await hmacSha256(queryString, apiSecret)}`;
        break;

      case 'getOpenOrders':
        const tsOpenOrders = Date.now().toString();
        const baseQuery = { timestamp: tsOpenOrders };
        if (params.symbol) baseQuery.symbol = params.symbol;
        queryString = new URLSearchParams(baseQuery).toString();
        url = `https://fapi.binance.com/fapi/v1/openOrders?${queryString}&signature=${await hmacSha256(queryString, apiSecret)}`;
        break;

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

    const response = await fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': key.api_key }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Binance API error (${action}):`, response.status, errorText);
      let errorMsg = `Binance error: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.msg || errorMsg;
      } catch (e) {
        errorMsg = errorText;
      }
      return Response.json({ 
        success: false,
        error: errorMsg,
        binanceStatus: response.status,
        action: action
      });
    }

    const data = await response.json();
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});