Deno.serve(async (req) => {
  try {
    const apiKey = "69ff08a813464d000159749e";
    const apiSecret = "76683f3b-989b-4a29-a005-d29a077b8406";
    const apiPassphrase = "198730";

    // Helper: HMAC-SHA256 as BASE64
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

    const timestamp = Date.now().toString();
    
    // Test with Base64 encoding
    const path = '/api/v1/account-overview';
    const msg = `${timestamp}GET${path}`;
    const sig = await hmacSha256Base64(msg, apiSecret);
    // Passphrase: HMAC-SHA256(passphrase, secret) in BASE64
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