// Supabase Edge Function: send FCM background push when a notification row is inserted.
//
// Trigger: a Database Webhook on `public.notifications` (INSERT) → this function.
// Secrets required (Supabase → Project Settings → Edge Functions → Secrets):
//   SUPABASE_URL                - your project URL (auto-available in most setups)
//   SUPABASE_SERVICE_ROLE_KEY   - service role key (to read device_tokens, bypassing RLS)
//   FCM_SERVICE_ACCOUNT         - the Firebase service-account JSON (whole file, as a string)
//
// FCM HTTP v1 requires an OAuth2 access token signed from the service account.
// We mint one with a JWT (RS256) → token endpoint, then POST the message per device.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotificationRow {
  user_id: string;
  group_id: string | null;
  type: string;
  body: string;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const row: NotificationRow = payload.record ?? payload.new ?? payload;
    if (!row?.user_id || !row?.body) return json({ skipped: 'no recipient/body' });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // recipient's device tokens
    const { data: tokens } = await sb
      .from('device_tokens').select('token').eq('user_id', row.user_id);
    if (!tokens || tokens.length === 0) return json({ sent: 0, reason: 'no devices' });

    const accessToken = await getAccessToken();
    const projectId = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!).project_id;

    let sent = 0;
    const stale: string[] = [];
    for (const { token } of tokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: 'Splitr', body: row.body },
            data: { groupId: row.group_id ?? '', type: row.type },
            android: { priority: 'high', notification: { channel_id: 'default' } }
          }
        })
      });
      if (res.ok) sent++;
      else if (res.status === 404 || res.status === 400) stale.push(token); // unregistered/invalid
    }
    // clean up dead tokens so we don't keep trying them
    if (stale.length) await sb.from('device_tokens').delete().in('token', stale);

    return json({ sent, cleaned: stale.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Mint a short-lived OAuth2 access token for FCM from the service account (RS256 JWT).
async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tok = await res.json();
  if (!tok.access_token) throw new Error('FCM auth failed: ' + JSON.stringify(tok));
  return tok.access_token;
}

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
