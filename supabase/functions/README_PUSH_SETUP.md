# FCM background push — setup (free to run)

The code is built. These console steps "light it up". The app builds/runs fine
without them (you keep in-app + local notifications).

## 1. Firebase project
- console.firebase.google.com → Add project → Add app → **Android**
- Package name: `com.splitr.app` (exact)
- Download `google-services.json`

## 2. google-services.json into the build
- Local: put it at `android/app/google-services.json` (gitignored)
- Cloud APK: `base64 -w0 google-services.json` → GitHub repo Settings → Secrets →
  Actions → new secret `GOOGLE_SERVICES_JSON` = the base64 string

## 3. FCM service-account key
- Firebase → Project settings → Service accounts → Generate new private key (JSON)

## 4. Deploy the Edge Function + secret
```
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy push-on-notification
```
Then set ONE secret in the Dashboard (Edge Functions → Secrets):
- `FCM_SERVICE_ACCOUNT` = the whole Firebase service-account JSON.

Do NOT set SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL — Supabase auto-provides
those to every Edge Function (and the dashboard blocks the SUPABASE_ prefix).
The "Docker is not running" warning during deploy is harmless.

## 5. SQL migrations (SQL Editor)
- `migration_2026-06-21_chat_notifications.sql` (if not already run)
- `migration_2026-06-21_device_tokens.sql`

## 6. Database Webhook
- Supabase → Database → Webhooks → Create
- Table `notifications`, event **Insert**, type **Supabase Edge Function** →
  `push-on-notification`

## 7. Rebuild & test
- Push to main → APK bakes in google-services.json
- Install, sign in (grant notification permission), fully close the app,
  have another account add an expense involving you → background push arrives.

## Cost
FCM: free. Edge Function: free tier 500K/mo. Webhook: free. Total: $0 for your usage.
