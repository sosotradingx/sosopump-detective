Deno.serve(async (req) => {
  try {
    const { apiKey, apiSecret, apiPassphrase } = await req.json();
    
    if (!apiKey || !apiSecret || !apiPassphrase) {
      return Response.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Helper: HMAC-SHA256 in HEX
    async function hmacSha256Hex(message, secret) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
      return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const timestamp = Date.now().toString();
    const path = '/api/v1/account-overview';
    const msg = `${timestamp}GET${path}`;
    
    // Signature in HEX, passphrase in BASE64
    async function hmacSha256Base64(message, secret) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
      return btoa(String.fromCharCode(...new Uint8Array(sig)));
    }
    
    const sig = await hmacSha256Hex(msg, apiSecret);
    const passHash = await hmacSha256Base64(apiPassphrase, apiSecret);
    
    console.log('[TEST] Using Base64 encoding for /api/v1/account');
    console.log('Signature:', sig.substring(0, 30) + '...');
    console.log('PassHash:', passHash.substring(0, 30) + '...');
    
    const res = await fetch(`https://api-futures.kucoin.com${path}`, {
      method: 'GET',
      headers: {
        'KC-API-KEY': apiKey,
        'KC-API-SIGN': sig,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': passHash
      }
    });
    
    const data = await res.json();
    console.log('Response:', res.status, JSON.stringify(data).substring(0, 100));
    
    if (res.ok) {
      return Response.json({ success: true, data, encoding: 'BASE64' });
    }
    
    return Response.json({ error: data, status: res.status, encoding: 'BASE64' }, { status: 500 });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});