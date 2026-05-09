import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { method, path, params = {}, keyId } = await req.json();
    if (!keyId) return Response.json({ error: 'keyId required' }, { status: 400 });

    // Get & decrypt API credentials
    const decrypted = await base44.functions.invoke('decryptApiSecret', { keyId });
    const apiKey = decrypted.data?.key;
    const apiSecret = decrypted.data?.secret;
    const apiPassphrase = decrypted.data?.passphrase;

    if (!apiKey || !apiSecret || !apiPassphrase) {
      throw new Error('Missing API credentials');
    }

    // Sign request
    const timestamp = Date.now();
    const body = method === 'GET' ? null : JSON.stringify(params);
    const message = `${timestamp}${method}${path}${body || ''}`;
    const signature = await hmacSha256(message, apiSecret);
    const passphraseHash = await hmacSha256(apiPassphrase, apiSecret);

    // Make KuCoin request
    const kucoinRes = await fetch(`https://api-futures.kucoin.com${path}`, {
      method,
      headers: {
        'KC-API-KEY': apiKey,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp.toString(),
        'KC-API-PASSPHRASE': passphraseHash,
        'Content-Type': 'application/json'
      },
      body
    });

    const data = await kucoinRes.json();
    if (!kucoinRes.ok) {
      throw new Error(data.msg || `KuCoin error ${kucoinRes.status}`);
    }

    return Response.json({ data: data.data || data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});