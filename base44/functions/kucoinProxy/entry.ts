import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    // Build request URL & body
    const timestamp = Date.now().toString();
    let url = `https://api-futures.kucoin.com${path}`;
    let bodyStr = '';

    if (method === 'GET') {
      if (Object.keys(params).length > 0) {
        const qs = new URLSearchParams(params).toString();
        url += '?' + qs;
      }
    } else {
      bodyStr = JSON.stringify(params);
    }

    // KuCoin signing: message = timestamp + method + path + body
    const signMessage = timestamp + method + path + bodyStr;
    
    // HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(signMessage));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    // Hash passphrase
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const passBuffer = await crypto.subtle.sign('HMAC', passphraseKey, encoder.encode(apiPassphrase));
    const passphraseHash = btoa(String.fromCharCode(...new Uint8Array(passBuffer)));

    // Make KuCoin request
    const kucoinRes = await fetch(url, {
      method,
      headers: {
        'KC-API-KEY': apiKey,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': passphraseHash,
        'Content-Type': 'application/json'
      },
      body: bodyStr || undefined
    });

    const data = await kucoinRes.json();
    if (!kucoinRes.ok) {
      throw new Error(data.msg || `KuCoin error ${kucoinRes.status}: ${JSON.stringify(data)}`);
    }

    return Response.json({ data: data.data || data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});