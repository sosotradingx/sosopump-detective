import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { keyId } = await req.json();
    if (!keyId) return Response.json({ error: 'keyId required' }, { status: 400 });

    // Use binanceApi proxy to avoid geo-restrictions
    const result = await base44.functions.invoke('binanceApi', {
      action: 'getBalance',
      keyId: keyId
    });

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