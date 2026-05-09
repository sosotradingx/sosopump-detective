import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { keyId } = await req.json();
    if (!keyId) return Response.json({ error: 'keyId required' }, { status: 400 });

    // Test KuCoin API connectivity
    const apiKey = await base44.asServiceRole.entities.UserApiKey.filter({ id: keyId, created_by: user.email });
    if (!apiKey || !apiKey.length) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }
    
    const decrypted = await base44.asServiceRole.functions.invoke('decryptApiSecret', { keyId });
    
    // Test KuCoin account balance endpoint
    const kucoinRes = await fetch('https://api.kucoin.com/api/v1/accounts', {
      headers: {
        'KC-API-KEY': apiKey[0].api_key,
        'KC-API-SECRET': decrypted.api_secret,
        'KC-API-PASSPHRASE': decrypted.api_secret // KuCoin uses passphrase too
      }
    });
    
    if (!kucoinRes.ok) {
      throw new Error('KuCoin API connection failed');
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