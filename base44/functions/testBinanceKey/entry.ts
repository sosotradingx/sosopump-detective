import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function hmacSha256Hex(message, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { keyId } = await req.json();
    if (!keyId) return Response.json({ error: 'keyId required' }, { status: 400 });

    // Get API key from database
    const apiKeyRecord = await base44.asServiceRole.entities.UserApiKey.filter({ id: keyId, created_by: user.email });
    if (!apiKeyRecord || !apiKeyRecord.length) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }
    
    const decrypted = await base44.functions.invoke('decryptApiSecret', { keyId });
    const apiSecret = decrypted.data?.secret;
    const apiKey = apiKeyRecord[0].api_key;
    
    // Binance test endpoint
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await hmacSha256Hex(queryString, apiSecret);
    
    const endpoint = apiKeyRecord[0].market_type === 'futures' 
      ? 'https://fapi.binance.com/fapi/v1/account'
      : 'https://api.binance.com/api/v3/account';
    
    const binanceRes = await fetch(`${endpoint}?${queryString}&signature=${signature}`, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Accept': 'application/json'
      }
    });
    
    if (!binanceRes.ok) {
      const errData = await binanceRes.text();
      throw new Error(`Binance error ${binanceRes.status}: ${errData}`);
    }

    return Response.json({
      success: true,
      message: 'Conexiune reușită ✓'
    });
  } catch (error) {
    const msg = error.message || 'Eroare de conectare';
    return Response.json({ 
      success: false, 
      message: msg
    }, { status: 500 });
  }
});