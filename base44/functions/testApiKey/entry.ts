import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createHmac } from 'node:crypto';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { api_key_id } = await req.json();
    if (!api_key_id) return Response.json({ error: 'api_key_id required' }, { status: 400 });

    // Fetch the key record (service role to read any record)
    const keys = await base44.asServiceRole.entities.UserApiKey.filter({ id: api_key_id });
    const keyRecord = keys?.[0];

    if (!keyRecord) return Response.json({ success: false, message: 'Cheia nu a fost găsită' });
    // Security: only owner can test their key
    if (keyRecord.created_by !== user.email) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const isFutures = (keyRecord.market_type || 'futures') === 'futures';
    const baseUrl = isFutures
      ? 'https://fapi.binance.com/fapi/v1/account'
      : 'https://api.binance.com/api/v3/account';

    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = createHmac('sha256', keyRecord.api_secret).update(queryString).digest('hex');
    const url = `${baseUrl}?${queryString}&signature=${signature}`;

    const resp = await fetch(url, {
      headers: { 'X-MBX-APIKEY': keyRecord.api_key }
    });
    const data = await resp.json();

    const success = resp.ok && !data.code;
    return Response.json({
      success,
      message: success ? 'Conexiune reușită ✓' : (data.msg || `Eroare ${resp.status}`)
    });
  } catch (error) {
    return Response.json({ success: false, message: error.message }, { status: 500 });
  }
});