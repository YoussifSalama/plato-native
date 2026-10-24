# Plato — cost per feature & pricing basis

Date: 2026-10-10. **All token counts are estimates** read from prompt/schema
sizes in the code (≈4 chars/token); the code has no usage metering yet.
Replace with real numbers once metering exists (see §7).

## 0. Prices used (USD per 1M tokens)

| Model | In | Out | Used by |
|---|---|---|---|
| gpt-4o | 2.50* | 10.00* | profile extraction, preference suggestion |
| gpt-4.1 | 2.00 | 8.00 | career assistant |
| gpt-4.1-mini | 0.40 | 1.60 | title planner, country resolver, resume, apply answers, failure doctor, career web research |
| gpt-4.1-nano | 0.10 | 0.40 | onboarding chat, orchestrator chat |

Sources: [pricepertoken gpt-4.1](https://pricepertoken.com/pricing-page/model/openai-gpt-4.1),
[mini](https://pricepertoken.com/pricing-page/model/openai-gpt-4.1-mini),
[nano](https://pricepertoken.com/pricing-page/model/openai-gpt-4.1-nano).
*gpt-4o price from memory, not confirmed by search. Web-search tool call:
$10 / 1k calls per one tracker (dated 2026 wk14), $25–35 / 1k per older
sources — unconfirmed on OpenAI's site, so a range is used. Check
[OpenAI pricing](https://developers.openai.com/api/docs/pricing) before billing decisions.

## 1. Apify — cost of ONE request, per platform

From [DISCOVERY_COST_REPORT.md](DISCOVERY_COST_REPORT.md). Pay-per-result, free-tier prices.
"Request" = one actor call at the 40-record system cap.

| Platform | $/result | One call (40 rec) |
|---|---|---|
| Talent | 0.00070 | 0.028 |
| JobBank | 0.00079 | 0.032 |
| Dice | 0.00099 | 0.040 |
| Handshake | 0.00100 | 0.040 |
| LinkedIn | 0.00100 | 0.040 |
| Wuzzuf | 0.00092 | 0.042 (incl. $0.005 start) |
| Google Jobs | 0.00220 | 0.088+ |
| Jobillico | 0.00299 | 0.120 |
| BuiltIn | 0.00300 | 0.120+ |
| Indeed | 0.00300 | 0.125 |
| ZipRecruiter | 0.00410 | 0.174 |
| Glassdoor | 0.00500 | 0.210 |
| **All 12, once** | avg **0.00214** | **≈ $1.06** (avg **$0.088**/platform) |

Real search is not 1 call per platform: 11 boards × up to 3 titles, records
drop to the 5-floor under the default budget (200).

| Scenario (1 seeker, 1 discovery run) | Apify cost |
|---|---|
| Default budget 200, 1 country | **≈ $0.56** |
| Default budget, 2 countries | ≈ $1.02 |
| Budget 2000, 1 country | ≈ $2.55 |
| Theoretical ceiling | ≈ $3.30 |

Not on the table above: ATS aggregator (Greenhouse/Lever/Workable/Ashby) is also an Apify actor (one bundled call per search, price not itemized here). Public boards and local index were not checked for Apify use.

## 2. Onboarding (CV → profile → preferences → chat)

| Step | Model | Tokens in / out | Cost |
|---|---|---|---|
| Profile extraction + findings (CV + certs ≈ 3k tok text + 1.6k prompt + schema) | gpt-4o | 5,000 / 2,000 | $0.0325 |
| Preference suggestion (profile JSON) | gpt-4o | 2,500 / 300 | $0.0093 |
| Onboarding chat, ~5 msgs | gpt-4.1-nano | 7,500 / 750 | $0.0011 |
| Profile evaluation | none (deterministic) | — | $0 |
| **Total per seeker** | | **≈ 15k / 3k** | **≈ $0.043** (budget $0.04–0.08 with re-uploads) |

gpt-4o is 80% of it. Moving extraction to gpt-4.1-mini cuts onboarding to ≈ $0.007.

## 3. New search finder (discovery LLM part)

| Step | Model | Tokens in / out | Cost |
|---|---|---|---|
| Title planner (evidence: ≤12 jobs, ≤60 skills) | gpt-4.1-mini | 4,000 / 250 | $0.0020 |
| Country resolver (only unknown places) | gpt-4.1-mini | 500 / 100 | $0.0004 |
| AI re-ranking | **not built** (BM25 only) | — | $0 |
| **LLM total per run** | | | **≈ $0.0024** |

Search = **$0.56 Apify + $0.0024 LLM** → Apify is **99.6%** of search cost.
When AI re-rank ships, add ≈ $0.01–0.03 (shortlist × mini).

## 4. Resume builder (AI-native)

| Step | Model | Tokens in / out | Cost |
|---|---|---|---|
| Job analyzer (posting ≤5k chars) | gpt-4.1-mini | 1,800 / 250 | $0.0011 |
| Resume writer (facts + strategy) | gpt-4.1-mini | 3,000 / 1,200 | $0.0031 |
| PDF render + parse (Playwright) | no tokens, server CPU | — | ~$0 |
| **Tailored resume** | | 4.8k / 1.5k | **≈ $0.0042** |
| Generic resume (no job) | | 3k / 1.2k | ≈ $0.0031 |

## 5. Other live AI features (for plan design)

| Feature | Cost per unit |
|---|---|
| Auto-apply, per application (tailored resume $0.0042 + answer drafts 5k/0.5k $0.0028) | **≈ $0.007** (+$0.0017 if failure doctor runs; max 3 attempts) |
| Orchestrator chat message (nano, ~20k in incl. tools/history, 500 out) | ≈ $0.0022 |
| Career assistant message (gpt-4.1, ~12k in / 500 out) | **≈ $0.028** |
| Career web research (mini + search call) | ≈ $0.012–0.027 |
| Career session (8 msgs + 1 resume + 1 research) | **≈ $0.25** |

Career assistant is the priciest LLM piece. Moving it gpt-4.1 → gpt-4.1-mini ≈ 5× cheaper.

## 6. AI interview practice (not built — projection)

| Design | Per 15-min session |
|---|---|
| Text, gpt-4.1-mini, 10 Q, final feedback | **$0.02–0.04** |
| Voice pipeline (STT ≈$0.003/min + LLM + TTS ≈$0.015/min) | **≈ $0.15** |
| Realtime voice, mini-class model (audio $10 in / $20 out per 1M, [source](https://developers.openai.com/api/docs/models/gpt-4o-mini-realtime-preview)) | **≈ $0.15–0.50** (context re-billed each turn; cached input helps) |
| Realtime voice, full model (≈4× mini) | ≈ $0.6–2.0 |

Voice numbers are rough; STT/TTS per-minute and current gpt-realtime rates
not confirmed. Pilot with usage logging before pricing. Start with text.

## 7. What this means for pricing

**Cost per active seeker per month (example):** onboarding 0.043 + 4 discovery
runs 2.24 + 30 auto-applies 0.21 + 3 resumes 0.01 + 2 career sessions 0.50
+ 20 chat msgs 0.04 + 3 text interviews 0.10 ≈ **$3.1**. Discovery = 72%;
without Apify ≈ $0.9.

**Rules that follow**
1. Only two things cost real money: **discovery (Apify)** and **career chat (gpt-4.1)**. Everything else is cents → "unlimited / fair use" on those.
2. Quota only discovery runs (and career sessions). Let the `budget` knob be the plan tier: Free = no board scrapers (check ATS/public/local sources for Apify use first), Pro = default budget on boards, Max = higher budget.
3. Biggest cost lever = cache identical searches across seekers (title+country+source, 6–12h) — see [DISCOVERY_COST_TRADEOFFS.md](DISCOVERY_COST_TRADEOFFS.md) option D.
4. Price = COGS × 3–5 + payment fee (card ≈ 3% + fixed; for Egypt use a local gateway) — check gateway fees, not verified here.

**Starter plan shape (adjust to market, Egypt may need local-currency/PPP pricing):**

| Plan | Includes | COGS/mo | Suggested price |
|---|---|---|---|
| Free | Onboarding, limited ATS/public search, 1 board-search, 10 chat msgs, 1 resume | ≈ $0.7 | $0 |
| Pro | 6 board-search runs, 50 auto-applies, 10 resumes, 2 career sessions, 3 text interviews, fair-use chat | ≈ $4.3 | $12–15 |
| Max | 20 runs (or higher budget), 200 auto-applies, voice interviews, 6 career sessions | ≈ $15–20 | $39–49 |
| Top-up | Extra board-search run or credit pack | $0.56 each | $2 / run |

Hard cap per user per month on Apify spend (stops a runaway bill). Free is a
cost center: keep its Apify spend at or near $0.

## 8. Metering (added 2026-10-10)

`usage_events` collection now records every LLM run (feature, model, tokens) and Apify run (actor, `apify_usd`), with `user_id` from the request. Run `npm run prisma:push` once. Background work with no request has `user_id` null. After 2 weeks of traffic, replace every estimate above with the measured median per `feature` and re-check margins.
