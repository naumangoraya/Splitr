# Splitr

A mobile-first expense-splitting app (a Splitwise clone) built with React + Vite + TypeScript + Tailwind, backed by Supabase. Amounts default to **PKR**. Installable as a PWA. Runs at **$0** on free tiers.

It boots in **demo mode** with sample data so you can click around immediately. Add your Supabase keys to switch it to a real, multi-user backend.

---

## Build an installable Android APK (no Android Studio needed)

This project is wrapped with **Capacitor**, so it builds into a real `.apk` your colleagues can install. You don't need a PC setup or Android Studio — a free GitHub account builds it in the cloud.

> Do step 2 (Supabase) first, so your keys get baked into the app. Without them the APK still runs, but only in demo mode.

1. **Push this project to GitHub.** Create a free repo at https://github.com/new and upload this folder (or `git push`).
2. **Add your Supabase keys as secrets.** In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add two:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon public key
3. **Build the APK.** Open the **Actions** tab → **Build Android APK** → **Run workflow**. It takes ~5 minutes.
4. **Download it.** Open the finished run, scroll to **Artifacts**, and download **splitr-apk**. Unzip it to get `app-debug.apk`.
5. **Share & install.** Send `app-debug.apk` to your colleagues (WhatsApp, Drive, email). On their phone they tap it, allow **"Install from unknown sources"** when prompted, and install. Done.

The APK talks directly to your Supabase project, so everyone who installs it shares the same data.

### Getting your colleagues set up efficiently
1. You sign up first, then create your groups (e.g. "Office Lunch", "Trip").
2. In each group tap the **invite** icon and add each colleague's email.
3. When a colleague installs the APK and signs up **with that same email**, they're automatically dropped into those groups — no manual adding.
4. Tip: in Supabase **Authentication → Email**, turn **Confirm email** off while onboarding so sign-ups work instantly. Turn it back on later.

*(Want a Play Store-ready signed release later? The debug APK above is fine for direct sharing. A signed release just needs a one-time keystore — ask me and I'll wire it in.)*

---

## 1. Run it locally (demo mode, no account needed)

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173) and tap **Explore demo**. Everything works against in-memory sample data. Nothing is saved.

---

## 2. Go live with Supabase (about 10 minutes)

Everything below uses only free tiers.

### a. Create the project
1. Go to https://supabase.com → sign up → **New project**.
2. Pick a name and a strong database password. Choose the region closest to you (Singapore is nearest to Pakistan). Wait ~2 minutes for it to provision.

### b. Create the database
1. In the project, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this project, copy the whole file, paste it in, and click **Run**. It creates every table, security rule, and trigger in one shot. (It's safe to re-run if needed.)

### c. Turn on email login
1. Go to **Authentication → Providers → Email** and make sure it's enabled.
2. For testing, **Authentication → Sign In / Up → Email** → you can turn **Confirm email** off so accounts work instantly. Turn it back on before sharing widely.

### d. (Optional) receipts bucket
If you want receipt photos later: **Storage → New bucket** → name it `receipts` → keep it private.

### e. Get your keys
Go to **Project Settings → API** and copy:
- **Project URL**
- **anon public** key

### f. Plug the keys in
Copy `.env.example` to `.env` and fill both lines:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Restart `npm run dev`. The app now uses your real database. Create an account and you're live.

---

## 3. Deploy to the web (free, installable on phones)

1. Push this folder to a new GitHub repository.
2. Go to https://netlify.com → **Add new site → Import an existing project** → pick your repo.
3. Build settings are detected automatically (`npm run build`, publish `dist`). Before the first deploy, open **Site settings → Environment variables** and add the same two variables from your `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. You get a public `https://your-site.netlify.app` URL.
5. On a phone, open that URL in the browser → **Add to Home Screen**. It installs like a native app.

---

## 4. Keep the free database awake

Supabase pauses a free project after 7 days with no activity. This repo includes a GitHub Action that pings it every 3 days.

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**, add:
- `SUPABASE_URL` — your project URL
- `SUPABASE_ANON_KEY` — your anon key

The workflow in `.github/workflows/keepalive.yml` runs automatically.

---

## What's inside

```
src/
  lib/        money math, debt-simplification engine, balances, csv, supabase client
  data/       repository (demo + supabase implementations) and seed data
  context/    auth provider
  hooks/      async loader, online status
  components/ ui primitives, layout, split editor, settle-up sheet
  screens/    auth, dashboard, groups, group detail, friends, add expense, profile
  types/      shared domain types
supabase/
  schema.sql  the entire database (tables, RLS, triggers, grants, indexes)
```

### How money is handled
All amounts are stored as **integer minor units** (paisa = rupees × 100), never floats, so splits always reconcile to the last unit. PKR is displayed in whole rupees. The split engine (`src/lib/money.ts`) and debt simplifier (`src/lib/debt.ts`) have unit tests:

```bash
npm test
```

### Splitting
Four modes, all conserving the total exactly: **Equally**, **Exact amounts**, **Percentages**, **Shares**. Group balances can be shown either simplified (fewest payments) or as raw pairwise debts.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm test` | Run the money/debt unit tests |
