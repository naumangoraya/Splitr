# Splitr — project guide for Claude Code

Splitr is a mobile-first expense-splitting app (a Splitwise clone) for **PKR** users.
It runs as a web app and is packaged as an Android **APK** via Capacitor. Backend is
**Supabase** (Postgres + Auth + RLS). It must stay **free-tier** and work for a small
team sharing one backend.

The owner is **not a professional developer**. Prefer clear, safe, incremental changes.
Explain what you changed in plain language. Never leave the project in a broken state.

---

## Tech stack (do not swap without being asked)

- Vite + React 18 + TypeScript (strict) + Tailwind CSS
- React Router (`HashRouter` on native, `BrowserRouter` on web — see `src/main.tsx`)
- Supabase JS v2 (`@supabase/supabase-js`)
- Capacitor 8 for the Android wrapper (`android/` folder, `capacitor.config.ts`)
- lucide-react for icons
- Node **22+** is required (Capacitor CLI needs it; CI uses Node 22)

## How to run, test, and verify

```bash
npm install            # once
npm run dev            # local dev server at http://localhost:5173
npm test               # unit tests for money + debt math (must stay green)
npm run typecheck      # tsc -b --noEmit
npm run build          # full production build (also what CI runs)
npx cap sync android   # copy web build into the Android project (after build)
```

**Definition of done for any code change:** `npm test` passes, `npm run typecheck` is
clean, and `npm run build` succeeds. Run all three before saying a task is complete.
If you changed anything under `src/`, also confirm `npx cap sync android` runs clean.

## Directory map

```
src/
  lib/        money.ts (integer-paisa math + split distributors), debt.ts (simplification
              engine), balances.ts (net balances), csv.ts, supabase.ts (client + isConfigured)
  data/       db.ts (repository: demoDb + supaDb behind one Db interface), demoData.ts (seeds)
  context/    AuthProvider.tsx (useAuth; real Supabase auth + demo "exploreDemo")
  hooks/      useAsync.ts (loading/error/reload), useOnline.ts
  components/ ui/ (Button, Input, Avatar, Sheet, states…), layout/ (AppShell, BottomNav),
              expense/SplitEditor.tsx, group/SettleUpSheet.tsx
  screens/    Auth, Dashboard, Groups, GroupDetail, Friends, AddExpense, Profile
  types/      index.ts (shared domain types)
supabase/
  schema.sql  the entire database: tables, RLS, helper fn, new-user trigger, grants, indexes
.github/workflows/
  android.yml    builds the APK on GitHub runners (Node 22, JDK 21, uploads app-debug.apk)
  keepalive.yml  pings Supabase every 3 days so the free project doesn't pause
```

## Non-negotiable invariants

1. **Money is integer minor units (paisa = rupees × 100). Never use floats for money.**
   All splitting goes through `src/lib/money.ts`. Splits must conserve the total to the
   last paisa. If you touch split logic, add/keep tests in `src/lib/money.test.ts`.
2. **Every table has Row Level Security.** When adding a table or column, add matching RLS
   policies in `supabase/schema.sql`. Use the `is_group_member()` SECURITY DEFINER helper to
   avoid recursive policies. Never disable RLS to "make it work".
3. **PKR displays as whole rupees** (0 decimals) but is stored in paisa. See `decimalsFor`.
4. The data layer has **two implementations** (`demoDb`, `supaDb`) behind the `Db` interface
   in `src/data/db.ts`. If you add a method, implement it in **both**. Demo mode is selected
   automatically when Supabase env vars are absent (`isConfigured` in `src/lib/supabase.ts`).
5. **Friends are modeled as 2-person `is_direct` groups.** There is no separate friends table.

## Supabase: applying schema changes (READ THIS)

Editing `supabase/schema.sql` does **NOT** change the live database. The running project
already has the old schema. So whenever you change `schema.sql`, you must **also** give the
owner a small, copy-pasteable SQL snippet to run in the Supabase **SQL Editor** to migrate
the live database. Make these snippets idempotent (`drop policy if exists …`, `create … if
not exists`). Call this out clearly in your summary.

- The live project's anon key + URL live in a local `.env` (gitignored) and in GitHub repo
  **secrets** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) for the APK build.
- Email confirmation is turned OFF in Supabase so sign-up is instant during onboarding.

## Known issues / backlog (good things to fix)

- **Silent failures:** several screens (e.g. create group, add expense) `await` Supabase but
  don't surface errors — the button just spins on failure. Add visible error states; reuse
  the `useAsync` error path and the `ErrorState`/inline-error UI patterns. This is high value.
- **Friends tab is view-only.** Add an "Add friend by email" flow that creates a direct group.
- **Invitations only work if the invitee signs up *after* being invited** (the new-user
  trigger claims invites at sign-up). Make invites also resolve for users who already exist
  (e.g. an RPC that adds an existing profile to the group by email).
- Consider a realtime subscription so group members see each other's expenses live.

## Gotcha already hit (don't reintroduce)

When inserting a row and immediately `.select()`-ing it back, Supabase also applies the
**SELECT** policy to the returned row. For `groups`, the creator isn't a member yet at that
instant, so the read was denied (403 / Postgres `42501`) and the app hung. Fix kept in
`schema.sql`: `groups_read` allows `is_group_member(id, auth.uid()) OR created_by = auth.uid()`.
Watch for this pattern on any new insert-then-return.

## Style

- TypeScript strict; no `any` unless unavoidable (the supabase row mappers are the exception).
- Tailwind only, using the design tokens in `tailwind.config.js` (brand indigo, owed=emerald,
  owe=rose, canvas, ink). Keep the 480px mobile shell.
- Keep diffs small and focused. Don't reformat unrelated files. Don't add dependencies without
  saying why. Don't commit `.env` or any secret.

## Local-test-before-push workflow

1. Put real Supabase keys in a local `.env` (copy `.env.example`) so dev hits the same backend
   the APK uses.
2. `npm run dev`, open http://localhost:5173, use the browser device toolbar (phone width) to
   preview the mobile layout, and test the actual flow.
3. Run the verify gate (`npm test && npm run typecheck && npm run build`).
4. Only then commit & push. Pushing to `main` triggers the APK rebuild in GitHub Actions.
