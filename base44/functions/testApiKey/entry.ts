import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function hmacSHA256(secret, message) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { keyId } = await req.json();
    if (!keyId) return Response.json({ error: 'keyId required' }, { status: 400 });

    // Get key from database
    const keys = await base44.asServiceRole.entities.UserApiKey.filter({ id: keyId });
    const keyRecord = keys?.[0];

    if (!keyRecord) return Response.json({ success: false, message: 'Cheia nu a fost găsită' });
    if (keyRecord.created_by !== user.email) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const isFutures = (keyRecord.market_type || 'futures') === 'futures';
    const baseUrl = isFutures
      ? 'https://fapi.binance.com/fapi/v1/account'
      : 'https://api.binance.com/api/v3/account';

    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await hmacSHA256(keyRecord.api_secret, queryString);
    const url = `${baseUrl}?${queryString}&signature=${signature}`;

    const resp = await fetch(url, {
      headers: { 'X-MBX-APIKEY': keyRecord.api_key }
    });
    const data = await resp.json();

    const success = resp.ok && !data.code;
    return Response.json({
      success,
      message: success ? 'Conexiune reușită ✓' : (data.msg || `Eroare ${resp.status}`)
    });
  } catch (error) {
    return Response.json({ success: false, message: error.message }, { status: 500 });
  }
});