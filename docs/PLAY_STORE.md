# Publishing Splitr to the Google Play Store

This is the one-time setup to turn the app into a **signed Android App Bundle
(.aab)** that Play accepts, plus the answers you'll need in the Play Console.
The code side (signing config + CI job) is already wired — you only do the steps
below once.

---

## 1. Create your release keystore (ONE TIME — keep it forever)

The keystore is your app's signing identity. **If you lose it you can never
update the app again**, so back it up somewhere safe (password manager / cloud).

Run this on your machine (needs Java; pick your own passwords when prompted):

```bash
keytool -genkey -v -keystore splitr-release.keystore \
  -alias splitr -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a keystore password, your name/org (any sensible values), and a key
password. Remember both passwords. You now have `splitr-release.keystore`.

> Prefer I generate it for you? Tell me a password to use and I'll create it in
> the project (it's gitignored) and print the base64 — but running it yourself
> keeps the passwords entirely off this chat.

## 2. Add four GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of `base64 -w0 splitr-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password from step 1 |
| `ANDROID_KEY_ALIAS` | `splitr` |
| `ANDROID_KEY_PASSWORD` | the key password from step 1 |

(On macOS use `base64 -i splitr-release.keystore | tr -d '\n'` for the first one.)

Once `ANDROID_KEYSTORE_BASE64` exists, the **release** job in
`.github/workflows/android.yml` activates and produces a signed `splitr-aab`
artifact on every push to `main`. Without it, that job is skipped and only the
debug APK is built — nothing breaks.

## 3. Build locally instead (optional)

Create `android/key.properties` (gitignored) next to the keystore:

```
storeFile=../splitr-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=splitr
keyPassword=YOUR_KEY_PASSWORD
```

Put `splitr-release.keystore` in the repo root, then:

```bash
npm run build && npx cap sync android
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

## 4. Bump the version for each release

In `android/app/build.gradle`: increase `versionCode` by 1 every upload (2, 3,
4 …) and set a human `versionName` ("1.0.1"). Play rejects a re-used versionCode.

---

## 5. Play Console: store listing + Data Safety

Create the app at <https://play.google.com/console> (one-time $25 fee), then:

- **Privacy policy URL:** the hosted `PRIVACY.md`
  (`https://github.com/naumangoraya/Splitr/blob/main/PRIVACY.md`, or a GitHub
  Pages URL). Confirm the contact email in that file first.
- **App name:** Splitr · **Category:** Finance.
- **Screenshots:** at least 2 phone screenshots (Home, a group, a chat).

### Data Safety form answers (matches what the app actually does)
- **Data collected:**
  - *Personal info* → Email address, Name → collected, **not shared**, required.
  - *Financial info* → "Other financial info" (expense amounts/balances) →
    collected, not shared, required for the app's core function.
  - *Messages* → In-app messages → collected, not shared.
  - *App activity / IDs* → a push token for notifications → collected, not shared.
- **Is data encrypted in transit?** Yes (HTTPS to Supabase/FCM).
- **Can users request deletion?** Yes — via the email in the privacy policy.
- **No advertising, no third-party analytics, no location, no contacts.**

### Permissions to justify (already minimal)
- `INTERNET` — sync with the backend.
- `POST_NOTIFICATIONS` — expense/settlement/message alerts.

---

## 6. Security reminder
Rotate the FCM service-account key that was pasted into chat in an earlier
session (GCP Console → service account → keys → delete old, create new) and set
`FCM_SERVICE_ACCOUNT` only via the Supabase dashboard. Never commit the keystore,
`key.properties`, or any service key.
