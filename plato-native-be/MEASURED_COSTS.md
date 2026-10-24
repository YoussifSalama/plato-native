# Measured cost — one real session (onboarding → search → resume)

Source: `usage_events` collection, read-only query on 2026-10-10 (all 20 rows
in the DB, written 23:29–23:40 UTC on 2026-10-09). Thread
`6ac97ac64b2bcd62b3cecefc` (AI Integration Engineer search). Events carry no
thread id, so rows are grouped by feature, not by thread: the 14 chat messages
include the earlier looping chat of the same session.
Prices: gpt-4o $2.50/$10, gpt-4.1 $2/$8, gpt-4.1-mini $0.40/$1.60,
gpt-4.1-nano $0.10/$0.40 per 1M tokens (in/out). See
[COST_AND_PRICING.md](COST_AND_PRICING.md) for sources. **Sample size is 1 user,
1 CV**: treat as a data point, not an average.

## Measured

| Feature | Model | Calls | Tokens in | Tokens out | Cost |
|---|---|---|---|---|---|
| onboarding.extract (CV → profile) | gpt-4o | 1 | 3,713 | 723 | $0.0165 |
| onboarding.preferences | gpt-4o | 1 | 2,713 | 74 | $0.0075 |
| chat.orchestrator (search chat) | gpt-4.1-nano | 14 | 141,852 | 1,766 | $0.0149 |
| discovery.titles (title planner) | gpt-4.1-mini | 1 | 975 | 167 | $0.0007 |
| discovery.apify | Apify | **0** | — | — | **$0.00** |
| career.chat (resume chat) | gpt-4.1 | 2 | 9,085 | 176 | $0.0196 |
| resume.write | gpt-4.1-mini | 1 | 1,726 | 373 | $0.0013 |
| resume.analyze | — | 0 (no job posting given) | — | — | $0 |
| **Total** | | 20 | 160,064 | 3,279 | **$0.0605** |

## By operation

| Operation | Cost | Includes |
|---|---|---|
| **Onboarding** | **$0.024** | extract + preferences |
| **Search** | **$0.016** (≈ $0.0007 if the chat is excluded) | 14 chat msgs $0.0149 + title planner $0.0007 + Apify $0 |
| **Resume** | **$0.021** | career chat 2 calls $0.0196 + writer $0.0013 |

## Findings

1. **Apify cost was $0 on this search, but a search the index does not cover costs about $3 (your observation).** Here the local index returned 300 jobs and `RUN_TARGET` is 300 (`remainingBudget = max(0, 300 − 300)`), so the Apify budget was 0 and LinkedIn and Wuzzuf never ran (both show 0 fetched, status DONE). With no index hits the budget is 300 and every board runs. Your ≈ $3 matches the upper end of the earlier code-based estimate ($2.55–$3.30), not the $0.56 default-budget case, so **use $3 per uncovered search for pricing**. That figure is reported by you, not yet in `usage_events` (no uncovered search has been run since metering was added); the next uncovered search will record the exact `apify_usd` per actor.
2. **This search was Egypt-only** (`countries: ["EG"]`), which is why only Wuzzuf ran from the board list, and why the other boards were not used.
3. **Estimates were 2× too high on LLM cost.** Measured vs estimated per call: extraction $0.0165 vs $0.0325, orchestrator message $0.0011 vs $0.0022, title planner $0.0007 vs $0.0020, career call $0.0098 vs $0.028, resume writer $0.0013 vs $0.0031. Prompts and outputs are shorter than I assumed.
4. **Largest LLM line is the career chat** ($0.0098 per call on gpt-4.1), then CV extraction. The 14 search-chat messages together cost less than one career call.
5. **Not measured:** web-search tool fee (career research, not used here), auto-apply (answers, failure doctor), interview practice, and Apify on a non-index search.

## Infrastructure (fixed + storage)

Prices from [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing)
and third-party Hostinger reviews ([findstack](https://findstack.com/resources/hostinger-black-friday-2026),
[RamNode comparison](https://ramnode.com/ramnode-hostinger)). **Hostinger prices conflict between sources and
promos change: confirm at checkout.** These two lines are **not measured**; they are list prices plus assumptions.

| Item | Price | Notes |
|---|---|---|
| Cloudflare R2 storage (Standard) | $0.015 / GB-month | first 10 GB-month free |
| R2 writes (Class A: upload) | $4.50 / 1M | first 1M / month free |
| R2 reads (Class B: download) | $0.36 / 1M | first 10M / month free |
| R2 egress | **$0** | free on all classes |
| Hostinger VPS KVM 4 (4 vCPU, 16 GB RAM) | **≈ $28.99 / month** renewal (≈ $12.99 promo, term-locked; one source says $24.99) | fixed, regardless of users |

**R2 per seeker (estimate; file sizes are not stored in the DB):** CV + certificates ≈ 2 MB, plus a tailored resume PDF per application ≈ 80 KB, plus apply screenshots. About 10 MB per active seeker means **≈ $0.00015 / month** and a handful of requests (cents per million). Result: R2 stays **inside the free 10 GB until roughly 1,000 seekers**; at 100 GB it is ≈ $1.35 / month. Treat R2 as **≈ $0** in pricing.

**Hostinger 16 GB, what it buys (assumption: ~0.5 GB per headless Chrome, ~4 GB for Nest + OS, 6 concurrent apply browsers, ~1 minute per application):** up to roughly 6 applications per minute ≈ 8,000 applications / day of capacity. If the VPS runs about 10,000 applications a month, infra is ≈ **$0.003 per application**; at 1,000 applications ≈ $0.03. MongoDB is not included if it runs elsewhere (Atlas, etc.) — add its bill.

**Fixed cost per seeker (VPS $29 + R2 ≈ $0, spread over active seekers):**

| Active seekers | Infra per seeker / month |
|---|---|
| 50 | $0.58 |
| 100 | $0.29 |
| 500 | $0.058 |
| 1,000 | $0.029 |

## Full cost picture per seeker

| Part | Cost |
|---|---|
| Onboarding, search chat, resume (measured, above) | ≈ $0.06 one-time |
| Apify per search | **$0** if the index covers it, **≈ $3** if not (your observation) |
| Infra (VPS + R2) | $0.03 – $0.58 / month depending on user count |

Below ~100 seekers the **VPS is the biggest line** (≈ $0.29+ per seeker per month), larger than all LLM costs combined. Above ~1,000 seekers it vanishes. One uncovered search (≈ $3) costs more than 50× the whole onboarding + chat + resume flow, so Apify on index misses is the line to control: cap uncovered searches per plan, cache them, and grow the index.

## Recommended billing metric: per search, with a token guard (both)

| Option | Fits when | Verdict |
|---|---|---|
| Per number of searches | the cost is lumpy and per action | **Use for what the customer sees.** Apify (≈ $3 per uncovered search) is 95%+ of variable cost and it is per search, not per token. Customers understand "searches", not tokens. |
| Per token usage | the cost scales with text volume | **Do not charge by it.** All LLM work for onboarding + search + resume measured $0.06; tokens are a rounding error next to one Apify search. Metered tokens are a poor customer unit and invite bill shock. |
| Both | one big per-action cost plus a small per-token cost | **Meter both internally** (already in `usage_events`), **charge on searches**, and keep a **hidden LLM dollar cap** per plan as abuse protection. |

**Two search types, because their costs are 100× apart:**

| Type | What it is | COGS | How to sell it |
|---|---|---|---|
| Standard search | covered by the local index (Apify budget 0) | ≈ $0.02 (chat + title planner) | unlimited / fair use |
| Deep search | index miss, Apify boards run | **≈ $3** (observed) | counted, limited per plan |

Decide the type before running it: the index hit count is known first (`remainingBudget`), so the app can tell the seeker "this uses 1 deep search" before spending.

**Starter plans with the new $3 figure (replaces the plan table in COST_AND_PRICING.md, whose $0.56-per-search math is out of date):**

| Plan | Standard searches | Deep searches / month | LLM cap (hidden) | Variable COGS | Suggested price |
|---|---|---|---|---|---|
| Free | fair use | 0 | $0.20 | ≈ $0.2 | $0 |
| Pro | unlimited | 2 | $1.50 | ≈ $6–7.5 | $19 |
| Max | unlimited | 8 | $3 | ≈ $24–27 | $59 |
| Top-up | — | +1 deep search | — | ≈ $3 | $6 |

Prices keep roughly a 2× margin on deep searches, before card fees and the fixed VPS ($29 per month, spread over all users). Check the margin against real `apify_usd` before launch, and adjust local-currency prices for Egypt.

**Guards:**
- Count a deep search only after Apify actually ran (`discovery.apify` event exists), not when it is requested.
- Hard stop at the deep-search quota; the LLM dollar cap only throttles (switch to a cheaper model), it never shows tokens to the user.
- Cap Apify per run (the `budget` setting) so one search cannot exceed ≈ $3.
- Refund or don't count a deep search that returned 0 results from Apify errors.

## Reporting on the voice test

Every voice call writes one `career.voice` row: audio and text tokens in/out, cached tokens, model turns, seconds and an estimated cost (`cost_usd`, `meta`). Rates are in `src/modules/usage/pricing.ts` (gpt-realtime-mini audio $10 in / $20 out per 1M, text $0.60 / $2.40, cached audio $0.30; taken from the gpt-4o-mini-realtime page, so verify before pricing plans).

- Usage and cost are never shown to the user or returned by any user-facing endpoint. The internal report is `GET /admin/usage/summary` with the header `x-admin-key: <ADMIN_REPORT_KEY>` (set that variable in `.env`; without it the route answers 404). Optional `?feature=career.voice&days=7&userId=`: it returns total cost, calls, tokens, seconds and every voice call's split.
- Token counts come from the browser's `response.done` events, so treat them as estimates for planning. The authoritative bill is OpenAI's usage page.
- Run `npm run prisma:push` once: `usage_events` gained `cost_usd` and `meta`.

## Next measurement

To get a representative number, repeat with 3–5 different seekers and one search whose countries the index does not cover (US or CA). Then group `usage_events` by `feature` and take the median.
