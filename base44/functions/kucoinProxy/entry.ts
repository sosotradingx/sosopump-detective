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
    let queryString = '';

    if (method === 'GET') {
      const paramKeys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '');
      if (paramKeys.length > 0) {
        queryString = new URLSearchParams(paramKeys.reduce((acc, k) => { acc[k] = params[k]; return acc; }, {})).toString();
        url += '?' + queryString;
      }
    } else {
      bodyStr = JSON.stringify(params);
    }

    // KuCoin signing: message = timestamp + method + path + queryString (for GET) or body (for POST)
    const signMessage = timestamp + method + path + (queryString || bodyStr);
    
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

    // Hash passphrase - HMAC-SHA256(passphrase, apiSecret)
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const passBuffer = await crypto.subtle.sign('HMAC', passphraseKey, encoder.encode(apiPassphrase));
    const passphraseHash = btoa(String.fromCharCode(...new Uint8Array(passBuffer)));
    
    // Debug: log passphrase for verification
    console.log('[DEBUG] Passphrase hash for:', { passphraseLength: apiPassphrase.length, hashPreview: passphraseHash.substring(0, 20) + '...' });

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

    const responseText = await kucoinRes.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { msg: responseText };
    }

    if (!kucoinRes.ok) {
      console.error('KuCoin error:', {
        status: kucoinRes.status,
        path,
        method,
        timestamp,
        data,
        headers: {
          'KC-API-SIGN': signature.substring(0, 20) + '...',
          'KC-API-TIMESTAMP': timestamp
        }
      });
      throw new Error(`KuCoin ${kucoinRes.status}: ${data.msg || JSON.stringify(data)}`);
    }

    return Response.json({ data: data.data || data });
  } catch (error) {
    console.error('kucoinProxy error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});