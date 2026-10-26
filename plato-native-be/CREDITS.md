# Plato tokens (credits)

One balance for everything a seeker spends. Every metered call costs what it really costs us, converted at one rate, and the margin lives in the plan price.

**1,000 Plato tokens = $1 of our cost** (`CREDITS_USD_PER_TOKEN=0.001`).

## How a charge happens

Every cost already goes through `recordUsage()` (`src/modules/usage/usage.ts`), which writes a row to `usage_events`. Right after that row is written, `chargeUsage()` (`src/modules/credits/credits.ts`) turns the row into tokens with `tokensFor()` (`credit-prices.ts`) and takes them off the seeker's balance. That's an atomic decrement plus one `consume` line in `credit_ledger`.

| What | Tokens |
|---|---|
| AI call | its dollar cost (tokens × the model's price) ÷ $0.001. A gpt-4.1 career chat reply is about 10 tokens; the same text on gpt-4.1-mini is about 2. |
| Job board (Apify) | a fixed price per result per platform, plus the board's start fee (`APIFY_PRICES`). 40 results: Talent 28, Indeed 125, Glassdoor 210. A board not in the table pays what Apify reported. An empty run, or one whose results could not be read, is free. |
| Voice interview | the browser's reported cost, capped at `CREDITS_VOICE_USD_PER_MINUTE` (default $0.10, so 100 tokens) per minute of the time the server saw |
| Career research web search | $0.025 per search call (`WEB_SEARCH_USD_PER_CALL`, check OpenAI's page) |
| Auto apply (`extension.*`, `apply.*`) | free (out of scope) |

## Balance and plans

- `credit_accounts`: one per user, with plan, balance, and `period_start`/`period_end`.
- `credit_ledger`: append-only. Its kinds are `grant`, `consume`, `hold`, `release` and `adjust`.
- A new seeker gets the plan's grant on first use. When the period ends, the next read or charge resets the balance to the grant. There is no cron, unused tokens don't roll over, and two concurrent resets never double the grant.

| Plan | Tokens / month | Env |
|---|---|---|
| free | 1,000 | `CREDITS_FREE_MONTHLY` |
| pro | 7,000 | `CREDITS_PRO_MONTHLY` |
| max | 25,000 | `CREDITS_MAX_MONTHLY` |

## Enforcement

- **Paid routes** use `TokensGuard`. A seeker with no tokens left gets `402 { code: "insufficient_tokens", balance, resetsAt }` before any model or board is called. These routes are career chat (and its stream), resume suggestions, interviews, the search chat, the onboarding chat, CV analysis, and discover.
- **Deep search:** the paid boards get only as many results as the balance covers at the most expensive board's price, after a 50-token reserve for start fees. Free sources always run, and the search chat says when the search was trimmed.
- **Voice interview:** the call is as long as the balance allows, up to 15 minutes. That maximum is reserved (`hold`) when the call starts and settled when the transcript arrives. A call that never reports back keeps its reservation.
- **Known gap:** two paid actions started at the same moment both pass the balance check. The balance can then dip a little below zero, and the next month's reset clears it.

## Seeker API (web app)

- `GET /job-seeker/credits?limit=20` returns the balance, monthly grant, refill date and history.
- `GET /job-seeker/credits/prices` returns the plans, the voice cost per minute, the real average charge per feature over 30 days, and the board prices.

No dollar amount is ever returned to a seeker.

## Admin API

Every admin route needs the header `x-admin-key: $ADMIN_REPORT_KEY` and answers 404 without it. A seeker is named by user id or email.

```bash
# cost vs tokens charged, per feature and the top 50 seekers by cost
curl -H "x-admin-key: $KEY" "localhost:3000/admin/credits/report?days=30"
# one seeker
curl -H "x-admin-key: $KEY" localhost:3000/admin/credits/someone@example.com
# add tokens (negative to take away), with a reason
curl -H "x-admin-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"amount":500,"reason":"refund: board outage"}' localhost:3000/admin/credits/someone@example.com/adjust
# change plan: a fresh period with the plan's full grant, at once
curl -H "x-admin-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"plan":"pro"}' localhost:3000/admin/credits/someone@example.com/plan
```

## Not built yet

- **Payments (Paymob or Fawry for Egypt, or Stripe).** This needs a merchant account and its keys. Once a payment is confirmed, the provider's webhook calls `setPlan(userId, plan)`, which is already in place. Top-ups would call `adjustTokens`.
- **Prices based on real data.** Run real traffic for two weeks, then set the plan sizes and `CREDITS_VOICE_USD_PER_MINUTE` from `/admin/credits/report`.

## Setup

Run `npm run prisma:push` once on every environment to create `credit_accounts` and `credit_ledger`.
