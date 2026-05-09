import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function hmacSha256(message, secret) {
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
    const apiPassphrase = decrypted.data?.passphrase;
    
    if (!apiPassphrase) {
      throw new Error('Trading Passphrase is missing - update your API key with the 6-digit passphrase');
    }
    
    // KuCoin Futures test with proper signing
    const timestamp = Date.now();
    const path = '/api/v1/accounts';
    const message = `${timestamp}GET${path}`;
    const signature = await hmacSha256(message, apiSecret);
    const passphraseHash = await hmacSha256(apiPassphrase, apiSecret);
    
    const kucoinRes = await fetch(`https://api-futures.kucoin.com${path}`, {
      method: 'GET',
      headers: {
        'KC-API-KEY': apiKeyRecord[0].api_key,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp.toString(),
        'KC-API-PASSPHRASE': passphraseHash,
        'Accept': 'application/json'
      }
    });
    
    if (!kucoinRes.ok) {
      const errData = await kucoinRes.text();
      throw new Error(`KuCoin error ${kucoinRes.status}: ${errData}`);
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