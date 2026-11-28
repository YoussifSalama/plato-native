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

## Left to do (in this order)

Backend (`plato-native-be`):
1. **Register the error log**: import `ErrorLogModule` in `src/app.module.ts` and register the filter
   (`@Catch()` class in `src/modules/error-log/error-log.service.ts`) and its "stamp" guard/interceptor as
   `APP_FILTER` / `APP_GUARD` as the comment in `error-log.module.ts` says. It must keep Sentry working
   (`SentryGlobalFilter` is already the `APP_FILTER`): either chain to it or report to Sentry from the new
   filter. Keep response shapes unchanged; logging never throws.
2. **Users controller + module**: `src/modules/admin-users/admin-users.service.ts` exists (434 lines:
   list, analytics, block/unblock, ...) but has no controller/module. Add `AdminUsersController`
   (`@UseGuards(AdminGuard) @AdminPage('users')`) with the contract's `/admin/users*` routes and register
   the module.
3. **Rate limits**: `/admin/rate-limits` (list, delete) and `/admin/users/:id/clear-rate-limits`. The
   registry already exists: `rateLimiters` in `src/modules/extension/extension-token.ts` (every
   `RateLimiter` registers by name; admin limiters in `src/modules/admin/admin-limits.ts`). `RateLimiter`
   needs list/clear methods if missing.
4. **Dashboard**: `GET /admin/overview` (page `dashboard`) per the contract.
5. Check every contract route against the code (`grep -rn "@Controller('admin" src`), fix field-name
   mismatches with what `plato-admin/src/lib/types.ts` expects.
6. Specs the features agent was asked for: provider mapping, plans cache defaults + DB override, filter
   redaction/explanation + never-throws, blocked user refused by the jwt guard, rate-limit clear.
7. **Security review** of the admin auth (the auth agent's review is unconfirmed): seeker JWT never passes
   the admin guard and back; pending token can't act as a session; guard reloads the admin every request;
   no enumeration by message or timing; invite tokens single-use and hashed; super admin not editable by
   API; `admin` page not grantable; rate limits on signup/login/totp/super-reset; CORS `/admin/*` only for
   `ADMIN_URL` with credentials; cookies httpOnly + SameSite=Lax + Secure in production.

Full stack:
8. Run the backend + `plato-admin` together (`npm run dev` at the repo root starts all apps; admin on
   :5173 proxies `/admin` to :3000). Walk through: super signup → key → QR → TOTP → invite → invited
   signup → inactive toast → activate → login → only the role's pages visible. Then each page against real
   responses.
9. The new models need their unique indexes: `npm run prisma:push` in `plato-native-be`. **Ask the owner
   before running it** against any database that holds real data.

## Constraints

- Never run or write destructive commands (no `rm -rf`, prune, drop, delete scripts), not even in docs as
  "do not run" — a pasted one wiped production on 2026-11-09.
- No one-off scripts that mutate or process real Plato data; verify with tests/fixtures.
- Don't commit to `main`; keep working on `feat/admin-panel`. Don't deploy.
- The VPS `.env` will need `ADMIN_DOMAIN`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_KEY` before the next deploy
  (compose refuses to start without them) — see `deploy/CHECKLIST.md`.
- Talk to the owner in short Egyptian Arabic, result first.
