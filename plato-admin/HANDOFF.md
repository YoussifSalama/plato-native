# Admin panel — handoff (2026-11-28)

Branch: `feat/admin-panel`. Nothing of this is merged to `main` or deployed.

## Goal

An admin panel for Plato: a new Vite app `plato-admin/` plus `/admin/*` endpoints in `plato-native-be/`.
The API is fixed in [`API_CONTRACT.md`](API_CONTRACT.md). Read it first; both sides follow it.

Owner priorities, in order:
1. **Credits / Plans / Usage** — the business owner needs pricing now. Usage per user, for the whole
   platform, and per provider (Apify, Anthropic/Claude, OpenAI); plans editable from the panel with a live
   calculator (revenue, cost, margin, what the tokens buy).
2. **Users** — table + per-user *analytics* (searches, top search titles, active days, features used,
   spend). Not the full personal profile. Block/unblock (never delete), verify email, logout all,
   clear rate limits / IP limits.
3. **Logs** — web platform errors (module, page, time, status, data, a plain explanation; filter, sort,
   search) and extension errors in two views: all errors in one list, and one row per user that opens
   all that user's errors.
4. Later, not started: jobs/discovery, auto-apply report, content (quizzes, interviews, alerts).

## Owner rules (do not change without asking)

- Login = email + password, then **TOTP 2FA, mandatory for every admin**. First login shows a QR.
- Super admin = env `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_KEY`. Signup with that email asks for the key, then
  the QR. The key also resets the super admin's 2FA (`/admin/auth/super-reset`). Empty key = no super admin.
- Signup works only with an invitation: through the link (valid 3h), or a plain signup with the invited
  email (even after the link expired). Either way the admin is created **inactive** until the super admin
  activates them; an inactive admin gets the toast "account not active yet, ask an admin".
- **Auth errors are generic.** Never reveal that an email exists, a password is wrong, or an invitation
  exists. One message for every auth failure.
- Roles = a name + a list of pages, made by the super admin. The `admin` section (admins, roles, invites)
  is super-admin only and never grantable. `x-admin-key` is removed; every admin route uses the session.
- UI: brand cobalt; colour only for meaning; same action-bar spot on every page; one card size; no lone
  card on an empty page; responsive.

## How the work was done

Four agents ran in parallel against the contract:

| Agent | Scope | State |
|---|---|---|
| BE auth + security | `src/modules/admin/*`, `prisma/schema/admin.prisma`, guard, TOTP (node:crypto), invites, roles, CORS, removal of `x-admin-key` | Code in place, typechecks, `admin-auth.spec.ts` + `totp.spec.ts` pass. **Stopped before it reported**: its security review is not confirmed done. |
| BE features | usage per provider, plans in DB + calculator, credits ledger, users, logs | **Stopped in the middle** — see "Left to do". |
| Admin FE | the whole `plato-admin/` app | All screens exist; `npm run build` and `vitest` (calculator) pass. Stopped before it reported. Not yet run against the real API. |
| Integration | seeker web `x-plato-page` header + BLOCKED handling, extension error reporter (0.1.14), docker-compose/Caddy/CI/env/checklist for `admin.` subdomain | **Done** and verified (web lint/tsc/build, extension 405 tests + build, `docker compose config`). |

After the agents stopped, the main session fixed the backend typecheck (aggregateRaw typing, credits admin
spec moved off the old key, account-data spec now includes `errorLog`).

## Verified now

- `plato-native-be`: `npm run prisma:generate` ok, `npx tsc --noEmit` **clean**, `npx jest` 846 passed,
  2 failed. The 2 failures (`quizzes.spec.ts` work_style, `chat/page-registry.spec.ts` missing jobs/
  career/library controls) **fail on `main` too** — they were there before this work.
- `plato-admin`: `npm run build` ok, `npx vitest run` 5/5.
- `npx eslint src` in the backend reports many errors repo-wide (mostly prettier). Check only that the new
  files are clean; don't reformat the repo.

## Done in the 2026-11-28 follow-up session

- Error log registered: `ErrorLogModule` in AppModule, `ErrorLogFilter` (extends Sentry's filter, so Sentry still
  reports) as `APP_FILTER`, `ErrorLogStamp` as `APP_GUARD`, the ≥400 middleware first in `main.ts`.
- `AdminUsersModule`: `/admin/users*`, `/admin/rate-limits` (GET/DELETE), `/admin/overview`.
- Contract audit: `topLocations` is `{ location, count }`; list `sort` is `field` / `-field` (written into the
  contract); `GET /admin/plans` is readable with `plans` **or** `credits` (`@AdminPage` takes several keys);
  nullable fields typed in `types.ts`.
- **Logs pages were missing**: the repo root `.gitignore` has `logs/`, so `plato-admin/src/pages/logs/` was never
  committed. Rewritten; `plato-admin/.gitignore` now un-ignores that folder.
- Security review (all points of the old item 7 checked). Fixed: codes on auth/TOTP/pairing routes are redacted
  from error-log data; the `admin-*` sign-in limits are listed/cleared only by the super admin and never by a
  seeker's "clear rate limits". Failed sign-ins are explained as such in the log.
- Specs: `src/modules/admin-users/admin-panel.spec.ts` (providers, sort, plans catalog, redaction, explanation,
  never-throws, blocked seeker, admin token refused by the seeker guard, rate limits).
- Full stack walked on a **throwaway local Mongo** (docker, empty DB, `prisma db push` there only): super signup →
  key → QR → TOTP; second super signup, uninvited signup, wrong password, unknown email all the same 401; invite →
  plain invited signup → "pending activation" → inactive toast → activate → QR → role pages only (others 403,
  `/team` shows the 403 page); deactivation refuses the next request; super admin not editable; block → existing
  seeker session 403 BLOCKED and login 403; unblock, verify, logout-all, clear-rate-limits; seeker/admin cookies
  never cross; cross-site write 403; every page renders as super admin, phone width has no sideways scroll.

## Done after the owner's review (2026-11-28, later)

- Honest numbers: "Paid plans (set by hand)" instead of revenue until payments exist, with our cost as a monthly
  run-rate; errors split into server (5xx), ran out of tokens (402), other 4xx; every day in `ADMIN_TZ` (Cairo).
- Dashboard: every tile against the period before (green better / red worse), daily trend (active, signups, cost,
  searches), "Needs your attention" (`/admin/attention`), signup funnel, costliest seekers (loss marked), weekly
  retention (`/admin/retention`). One definition of "active" everywhere (includes page visits).
- Security: logout ends the admin's sessions on the server; admin audit log (`AdminAuditInterceptor`, Team > Audit
  log); Rate limits is super admin only; the user page no longer shows what a seeker searched for.
- Scale: Logs grouped view (`/admin/logs/groups`, "New" since the last deploy), error logs expire after 90 days
  (TTL index at boot, `ERROR_LOG_RETENTION_DAYS`), 60 s cache on the heavy reads.
- Removed as duplicates: dashboard Users and Cost-by-provider cards, user page "Active days per week" and "Events",
  Usage "Other" and "By user" tabs.

## Left to do

1. `npm run prisma:push` on the real database for the new collections and indexes (page_activity unique,
   admin_audit_logs, usage_events.discovery_run_id, credit_ledger.usage_event_id) — **ask the owner first**.
   Then restart the API: it recreates the error-log TTL index the push removes. On first start, error logs older than
   90 days are deleted by Mongo (set `ERROR_LOG_RETENTION_DAYS=0` before to keep them).
2. Pages were walked with an empty DB (one test seeker): usage, plans calculator and credits have not been seen
   with real numbers yet.
3. Known and accepted (owner rules or ponytails): typing the super admin's email at signup reveals it is the super
   email (asks for the key); admin logout only clears the cookie (the 12 h token stays valid if copied); rate
   limits and used TOTP steps are per process.
4. Later, not started: jobs/discovery, auto-apply report, content.

## Constraints

- Never run or write destructive commands (no `rm -rf`, prune, drop, delete scripts), not even in docs as
  "do not run" — a pasted one wiped production on 2026-11-09.
- No one-off scripts that mutate or process real Plato data; verify with tests/fixtures.
- Don't commit to `main`; keep working on `feat/admin-panel`. Don't deploy.
- The VPS `.env` will need `ADMIN_DOMAIN`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_KEY` before the next deploy
  (compose refuses to start without them) — see `deploy/CHECKLIST.md`.
- Talk to the owner in short Egyptian Arabic, result first.
