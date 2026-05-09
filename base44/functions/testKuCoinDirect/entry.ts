Deno.serve(async (req) => {
  try {
    const apiKey = "69ff08a813464d000159749e";
    const apiSecret = "76683f3b-989b-4a29-a005-d29a077b8406";
    const apiPassphrase = "198730";

    // Helper: HMAC-SHA256 as hex
    async function hmacSha256(message, secret) {
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
    
    // Test 1: /api/v1/account (singular) - should work for Futures
    const path1 = '/api/v1/account';
    const msg1 = `${timestamp}GET${path1}`;
    const sig1 = await hmacSha256(msg1, apiSecret);
    const passHash1 = await hmacSha256(apiPassphrase, apiSecret);
    
    console.log('[TEST] Attempting /api/v1/account');
    const res1 = await fetch(`https://api-futures.kucoin.com${path1}`, {
      method: 'GET',
      headers: {
        'KC-API-KEY': apiKey,
        'KC-API-SIGN': sig1,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': passHash1
      }
    });
    
    const data1 = await res1.json();
    console.log('Response 1:', res1.status, data1);
    
    if (res1.ok) {
      return Response.json({ success: true, data: data1, endpoint: path1 });
    }

    // Test 2: Try /api/v1/position (check positions endpoint)
    const path2 = '/api/v1/position';
    const msg2 = `${timestamp}GET${path2}`;
    const sig2 = await hmacSha256(msg2, apiSecret);
    
    console.log('[TEST] Attempting /api/v1/position');
    const res2 = await fetch(`https://api-futures.kucoin.com${path2}`, {
      method: 'GET',
      headers: {
        'KC-API-KEY': apiKey,
        'KC-API-SIGN': sig2,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': passHash1
      }
    });
    
    const data2 = await res2.json();
    console.log('Response 2:', res2.status, data2);
    
    if (res2.ok) {
      return Response.json({ success: true, data: data2, endpoint: path2 });
    }

    return Response.json({ error: 'Both endpoints failed', res1: res1.status, res2: res2.status, data1, data2 }, { status: 500 });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});