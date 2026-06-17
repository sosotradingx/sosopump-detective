import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const FAPI = "https://fapi.binance.com";

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

async function signedRequest(apiKey, apiSecret, method, path, params = {}) {
  const timestamp = Date.now().toString();
  const allParams = { ...params, timestamp };
  const qs = new URLSearchParams(allParams).toString();
  const signature = await hmac(qs, apiSecret);
  const url = `${FAPI}${path}?${qs}&signature=${signature}`;

  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey }
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || `HTTP ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { keyId, symbol, side, quantity, stopLoss, takeProfit, hedgeMode } = await req.json();

    // Get API credentials
    const keyRecord = await base44.asServiceRole.entities.UserApiKey.filter({ id: keyId });
    const key = Array.isArray(keyRecord) ? keyRecord[0] : keyRecord;
    if (!key || key.created_by !== user.email) {
      return Response.json({ error: 'Key not found or unauthorized' }, { status: 403 });
    }

    const apiKey = key.api_key;
    const apiSecret = key.api_secret;
    const closeSide = side === 'BUY' ? 'SELL' : 'BUY';
    const positionSide = side === 'BUY' ? 'LONG' : 'SHORT';

    const results = { slOrder: null, tpOrder: null, slError: null, tpError: null };

    // Try STOP_MARKET first, fallback to Algo API
    if (stopLoss > 0) {
      try {
        const slParams = {
          symbol, side: closeSide, type: 'STOP_MARKET',
          stopPrice: stopLoss.toString(),
          quantity: quantity.toString(),
          workingType: 'MARK_PRICE',
        };
        if (hedgeMode) slParams.positionSide = positionSide;
        else slParams.reduceOnly = 'true';
        results.slOrder = await signedRequest(apiKey, apiSecret, 'POST', '/fapi/v1/order', slParams);
      } catch (e1) {
        // Fallback: Algo API (USDC-M accounts)
        try {
          const algoParams = {
            symbol, side: closeSide,
            orderType: 'STP',
            quantity: quantity.toString(),
            stopPrice: stopLoss.toString(),
            workingType: 'MARK_PRICE',
            timeInForce: 'GTC',
          };
          if (hedgeMode) algoParams.positionSide = positionSide;
          results.slOrder = await signedRequest(apiKey, apiSecret, 'POST', '/fapi/v1/order/algo', algoParams);
        } catch (e2) {
          results.slError = e2.message;
        }
      }
    }

    if (takeProfit > 0) {
      try {
        const tpParams = {
          symbol, side: closeSide, type: 'TAKE_PROFIT_MARKET',
          stopPrice: takeProfit.toString(),
          quantity: quantity.toString(),
          workingType: 'MARK_PRICE',
        };
        if (hedgeMode) tpParams.positionSide = positionSide;
        else tpParams.reduceOnly = 'true';
        results.tpOrder = await signedRequest(apiKey, apiSecret, 'POST', '/fapi/v1/order', tpParams);
      } catch (e1) {
        // Fallback: Algo API (USDC-M accounts)
        try {
          const algoParams = {
            symbol, side: closeSide,
            orderType: 'TTP',
            quantity: quantity.toString(),
            stopPrice: takeProfit.toString(),
            workingType: 'MARK_PRICE',
            timeInForce: 'GTC',
          };
          if (hedgeMode) algoParams.positionSide = positionSide;
          results.tpOrder = await signedRequest(apiKey, apiSecret, 'POST', '/fapi/v1/order/algo', algoParams);
        } catch (e2) {
          results.tpError = e2.message;
        }
      }
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});