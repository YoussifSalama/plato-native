# Plato Admin — API contract

Single source of truth for the backend (`plato-native-be`) and the admin panel (`plato-admin`).
Change it only together on both sides.

All routes live under `/admin` on the existing API. JSON in, JSON out. Errors use Nest's
default shape: `{ statusCode, message, code? }`.

## Session

- Full session: httpOnly cookie `plato_admin` (JWT, `aud: "plato-admin"`, 12h, SameSite=Lax,
  Secure in production). Separate from the seeker cookie; the seeker guard must never accept it
  and the admin guard must never accept a seeker token.
- Half-way state (password OK, TOTP not done yet): httpOnly cookie `plato_admin_pending`
  (JWT, `aud: "plato-admin-pending"`, 10 min, claim `step: "totp" | "totp_setup"`). Max 5 wrong
  codes per pending token, then it is dead.
- The guard reloads the admin from the DB on every request (active, role pages, `sessions_valid_after`),
  so deactivation and role edits apply at once.
- CORS: origin `ADMIN_URL` with credentials, for `/admin/*` only.
- New env: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_KEY`, `ADMIN_URL`. `ADMIN_REPORT_KEY` / `x-admin-key` is removed.

## Error wording (security rule from the owner)

Auth errors never tell the caller whether an email exists, whether the password was wrong,
or whether an invitation exists. One message for every auth failure:
`401 { message: "Something went wrong. Check your details and try again." }`.
Equal timing (compare against a dummy bcrypt hash when the email is unknown). Rate limit
signup/login/totp/super-reset by IP and by email.

The only distinct responses, and only after the password is proven:
- `403 { code: "INACTIVE", message: "Your account is not active yet. Ask an admin to activate it." }`
- `{ next: "totp" | "totp_setup" }`

## Pages (permission keys)

`GET /admin/pages` → `[{ key, label }]`

Keys: `dashboard`, `usage`, `plans`, `credits`, `users`, `logs`.
`admin` (admins, roles, invites) is super-admin only and never grantable to a role.
Every admin endpoint declares its page with `@AdminPage('<key>')`; super admin passes all.

## Auth

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/admin/auth/signup` | `{ email, password, superKey?, inviteToken? }` | see below |
| POST | `/admin/auth/login` | `{ email, password }` | `{ next: "totp" \| "totp_setup" }` + pending cookie, or 403 INACTIVE, or 401 generic |
| GET | `/admin/auth/totp/setup` | (pending cookie, step totp_setup) | `{ otpauthUrl, secret }` (secret kept as pending on the admin until verified) |
| POST | `/admin/auth/totp/verify` | `{ code }` (pending cookie) | sets `plato_admin`, clears pending, returns `Me` |
| POST | `/admin/auth/logout` | | `{ ok: true }` |
| GET | `/admin/auth/me` | | `Me` |
| POST | `/admin/auth/super-reset` | `{ email, superKey, newPassword? }` | `{ ok: true }` — clears the super admin's TOTP (and sets the password if given). Generic 401 on any mismatch. |

Signup rules:
1. `email === SUPER_ADMIN_EMAIL` (case-insensitive):
   - no `superKey` → `200 { next: "super_key" }` (the panel then shows a key field and resubmits).
   - key wrong (timing-safe compare) or a super admin already exists → generic 401.
   - key right → create the super admin, active, `is_super: true` → `{ next: "totp_setup" }` + pending cookie.
2. `inviteToken` given: token (stored as sha256) valid, unexpired (3h), unused, email matches →
   create admin `active: false`, role from invite, mark invite used → `{ next: "pending_activation" }`.
3. No token: newest unused invite for that email (expired or not — the owner wants the role kept) →
   same as 2.
4. Anything else → generic 401.

`Me = { id, email, isSuper, active, role: { id, name } | null, pages: string[] }` (`pages` = all keys + `admin` for super).

TOTP: RFC 6238, SHA-1, 6 digits, 30 s, ±1 step window, issuer `Plato Admin`. Mandatory for every admin.

## Admin section (super only)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/admin/admins` | | `[{ id, email, isSuper, active, role, totpEnabled, createdAt, lastLoginAt }]` |
| PATCH | `/admin/admins/:id` | `{ active?, roleId? }` | admin row. Cannot change the super admin. |
| POST | `/admin/admins/:id/reset-2fa` | | `{ ok }` — next login re-runs QR setup; bumps `sessions_valid_after` |
| GET | `/admin/roles` | | `[{ id, name, pages, adminCount }]` |
| POST | `/admin/roles` | `{ name, pages }` | role |
| PATCH | `/admin/roles/:id` | `{ name?, pages? }` | role |
| DELETE | `/admin/roles/:id` | | `{ ok }` — 409 if admins still use it |
| GET | `/admin/invites` | | `[{ id, email, role, status: "pending"\|"used"\|"expired", expiresAt, createdAt }]` |
| POST | `/admin/invites` | `{ email, roleId }` | invite; emails `${ADMIN_URL}/signup?invite=<token>` |
| POST | `/admin/invites/:id/resend` | | invite — new token, new 3h window |
| DELETE | `/admin/invites/:id` | | `{ ok }` revoke |

## Dashboard — page `dashboard`

`GET /admin/overview?from&to` →
`{ users: { total, new, verified, blocked, activeInRange }, costUsd, revenueUsdMonthly, byProvider: [{ provider, costUsd }], applications: { total, submitted, failed }, errors: { total, platform: { web, extension, api } } }`

`from`/`to` are ISO dates everywhere; default last 30 days.

## Usage — page `usage`

Providers come from `UsageEvent`: `apify` (`apify_usd`), `anthropic` (model `claude-*`),
`openai` (model `gpt-*`, `o*`, `text-embedding-*`, realtime/voice), `other`.

| Method | Path | Result |
|---|---|---|
| GET | `/admin/usage/overview?from&to` | `{ totalCostUsd, events, byProvider: [{ provider, costUsd, events }], byFeature: [{ feature, costUsd, events }], byDay: [{ day, costUsd, byProvider: { [p]: usd } }] }` |
| GET | `/admin/usage/providers/:provider?from&to` | `{ provider, totalCostUsd, events, byModel: [{ model, costUsd, inputTokens, outputTokens, events }], byFeature: [...], byDay: [{ day, costUsd }], topUsers: [{ userId, email, costUsd, events }] }` |
| GET | `/admin/usage/users?from&to&q&page&sort` | `{ items: [{ userId, email, name, plan, costUsd, events, tokensSpent }], total }` |
| GET | `/admin/usage/users/:userId?from&to` | per-user version of overview |

## Plans — page `plans`

Plans and top-ups move from the constants in `credit-prices.ts` to a DB collection. The constants
stay as the defaults used when the collection has no row for a key (no seed script).

`Plan = { key, kind: "plan" | "topup", label, tokens, priceUsd, active, createdAt, updatedAt }`
(`tokens` = monthly grant for a plan, pack size for a top-up). `free` cannot be deleted or priced.

| Method | Path | Result |
|---|---|---|
| GET | `/admin/plans` | `{ items: Plan[], usdPerToken }` |
| POST | `/admin/plans` | `Plan` (key: `^[a-z0-9_]{2,20}$`, unique) |
| PATCH | `/admin/plans/:key` | `Plan` |
| DELETE | `/admin/plans/:key` | `{ ok }` → sets `active: false` (accounts on it keep working) |
| GET | `/admin/plans/calculator?from&to` | `{ usdPerToken, plans: [{ key, users, avgTokensUsed, p50TokensUsed, p90TokensUsed, avgCostUsd }], perFeature: [{ feature, avgTokensPerEvent, avgCostUsdPerEvent }], providerCostShare: [{ provider, share }] }` |

The panel computes the live calculator from this: for a price P and grant T →
cost if fully used `T × usdPerToken`, expected cost at avg/p90 usage, margin, break-even users,
and "what T buys" = `T / avgTokensPerEvent` per feature.

## Credits — page `credits`

Existing endpoints keep their paths, switch guard to the admin session:
`GET /admin/credits/report`, `GET /admin/credits/:user`, `POST /admin/credits/:user/adjust`,
`POST /admin/credits/:user/plan`, `POST /admin/credits/:user/topup`.
New: `GET /admin/credits/:user/ledger?page` → `{ items: CreditLedger[], total }`.
Every write records the acting admin id in the ledger `meta.admin`.

## Users — page `users`

Schema: `User.blocked_at DateTime?`, `User.blocked_reason String?`. A blocked seeker cannot log in
and every existing session is refused (`403 { code: "BLOCKED", message: "Your account is blocked. Contact support." }`).

| Method | Path | Result |
|---|---|---|
| GET | `/admin/users?q&status=all\|verified\|unverified\|blocked&page&sort` | `{ items: [{ id, name, email, createdAt, verified, blocked, plan, balance, lastActiveAt, costUsd }], total }` |
| GET | `/admin/users/:id/analytics?from&to` | `{ user: { id, name, email, createdAt, verified, blocked, blockedReason, plan, balance }, activity: { lastActiveAt, activeDays, activeDaysByWeek: [{ week, days }], events }, features: [{ feature, events, costUsd }], searches: { total, topTitles: [{ title, count }], topLocations: [...] }, applications: { total, byStatus: {...}, byEngine: {...} }, chat: { threads, messages }, interviews: number, spentTokens, costUsd, profile: { headline?, yearsExperience?, cvFile? } }` |
| POST | `/admin/users/:id/block` | `{ reason }` → user row |
| POST | `/admin/users/:id/unblock` | user row |
| POST | `/admin/users/:id/verify-email` | user row |
| POST | `/admin/users/:id/logout-all` | `{ ok }` |
| GET | `/admin/rate-limits?q` | `[{ limiter, key, hits, resetAt }]` — current in-memory limits (IP / user / email keys) |
| DELETE | `/admin/rate-limits?limiter&key` | `{ ok }` |
| POST | `/admin/users/:id/clear-rate-limits` | `{ cleared: n }` — every limiter key tied to that user, email or last IPs |

"Visits" = distinct days with any activity (usage events, chat messages, applications, searches).
ponytail: no page-view tracking; add a `last_seen` heartbeat if the owner needs real visit counts.

## Logs — page `logs`

`ErrorLog = { id, platform: "web" | "extension" | "api", module, page?, method, path, status, code?, message, explanation?, data?, userId?, userEmail?, ip?, userAgent?, createdAt }`

- `platform`: `extension` for `/extension/*` routes and extension client reports, `web` when the
  request carries `x-plato-page` (the seeker web app sends it), else `api`.
- `module`: Nest controller's module (e.g. `chat`, `credits`, `extension`).
- `explanation`: a short plain sentence from the backend on why it happened (a known-cause map
  by status / exception / Prisma code, falling back to the message).
- `data`: query + redacted body (no password/token/secret/key/authorization/cookie fields, max 8 KB).
- Every response with status ≥ 400 is recorded, plus uncaught errors. Writing a log must never throw.

Extension client errors: `POST /extension/v1/errors` (extension auth) body
`{ message, code?, page?, stack?, data? }` → stored with `platform: "extension"`.
Apply stops already stored in `ApplyBatchItem.detail.stops` are shown in the extension views too
(`source: "apply"`).

| Method | Path | Result |
|---|---|---|
| GET | `/admin/logs?platform&module&status&q&from&to&sort=newest\|oldest&page` | `{ items: ErrorLog[], total }` |
| GET | `/admin/logs/facets?platform` | `{ modules: [{ module, count }], statuses: [{ status, count }] }` |
| GET | `/admin/logs/:id` | `ErrorLog` |
| GET | `/admin/logs/extension/all?q&from&to&page` | `{ items: (ErrorLog & { source: "client" \| "server" \| "apply" })[], total }` |
| GET | `/admin/logs/extension/users?q&page` | `{ items: [{ userId, email, name, errors, lastAt, topCodes: [{ code, count }] }], total }` |
| GET | `/admin/logs/extension/users/:userId?page` | `{ user, items: [...same as extension/all] , total }` |

Pagination everywhere: `page` 1-based, 50 per page.
