import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keyId } = await req.json();
    if (!keyId) {
      return Response.json({ error: 'Missing keyId' }, { status: 400 });
    }

    // Fetch the API key record
    const key = await base44.asServiceRole.entities.UserApiKey.get(keyId);

    // Verify ownership
    if (key.created_by !== user.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Return all 3 KuCoin credentials
    return Response.json({
      secret: key.api_secret,
      passphrase: key.api_passphrase,
      key: key.api_key,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});