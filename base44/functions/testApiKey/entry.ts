import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { keyId } = await req.json();
    if (!keyId) return Response.json({ error: 'keyId required' }, { status: 400 });

    // Use binanceApi backend function to avoid IP restrictions
    const result = await base44.asServiceRole.functions.invoke('binanceApi', {
      action: 'getBalance',
      keyId: keyId
    });

    return Response.json({
      success: true,
      message: 'Conexiune reușită ✓'
    });
  } catch (error) {
    return Response.json({ 
      success: false, 
      message: error.message || 'Eroare de conectare' 
    }, { status: 500 });
  }
});