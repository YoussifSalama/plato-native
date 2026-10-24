# Plato job sources and pricing

Every place Plato gets jobs from, what a request costs, and how a seeker applies.
Sources: `DISCOVERY_COST_REPORT.md`, `SOURCES_LEGAL.md`, `PLATFORM_APPLY_METHODS.md`, `adapters/boards/*.ts`.
Prices are Apify free-tier, pay per result, checked 2026-10-13/15. They change; re-check before launch.

"One call" = one actor run at the 40-record system cap, unless a cap is noted.

## 1. Apify job boards (original 12)

| Platform | $/result | One call (40) | Region | Apply method |
|---|---|---|---|---|
| Talent | 0.00070 | 0.028 | global | ATS if link resolves, else link only |
| JobBank | 0.00079 | 0.032 | Canada | same |
| Dice | 0.00099 | 0.040 | US | same |
| Handshake | 0.00100 | 0.040 | US | account-gated, extension |
| LinkedIn | 0.00100 | 0.040 | global | account-gated, extension |
| Wuzzuf | 0.00092 | 0.042 (incl. $0.005 start) | Egypt | account-gated, extension |
| Google Jobs | 0.00220 | 0.088+ | global | ATS if link resolves, else link only |
| Jobillico | 0.00299 | 0.120 | Canada | same |
| BuiltIn | 0.00300 | 0.120+ | US | same |
| Indeed | 0.00300 | 0.125 | global | account-gated, extension |
| ZipRecruiter | 0.00410 | 0.174 | US/CA | same as Talent |
| Glassdoor | 0.00500 | 0.210 | global | same as Talent |

All 12 once: about $1.06 (avg $0.088 per platform).

## 2. Apify boards added 2026-10-13

All manual-apply: the card links to the original posting.

| Platform | Apify actor | $/result | One call | Region / scope | Risk |
|---|---|---|---|---|---|
| Wellfound | `igolaizola/wellfound-jobs-scraper` | 0.0005 | 0.020 + start | remote, one run, no title filter | high (terms bar automation) |
| Dynamite Jobs | `rl1987/dynamitejobs-scraper` | 0.001 | 0.040 | remote | low |
| GulfTalent | `shahidirfan/GulfTalent-Job-Scraper` | 0.001 | 0.045 (incl. $0.005 start) | Gulf | unknown |
| We Work Remotely | `bovi/weworkremotely-scraper` | 0.0015 | 0.060 | remote (RSS) | high (API terms bar job-search services) |
| Bayt | `goat255/bayt-scraper` | 0.002 | 0.080 | Gulf, Egypt, Jordan, Lebanon, Morocco | unknown |
| Arc | `parseforge/arc-dev-jobs-scraper` | 0.025 | 0.250 (capped at 10 jobs) | remote, dev | low |
| NoDesk | `parseforge/nodesk-remote-jobs-scraper` | 0.021 | 0.315 (capped at 15 jobs, no keyword filter) | remote | low |
| Naukrigulf | `bovi/naukrigulf-jobs-scraper` | 0.009 | 0.360 | Gulf | unknown (priciest) |
| Jobgether | `automation-lab/jobgether-remote-jobs-scraper` | under 0.01 | $0.005 per run + per-job fee (not published) | remote | low |
| Working Nomads | `benthepythondev/workingnomads-jobs-scraper` | not published | unknown | remote | low |

Known-price subtotal for the 8 priced boards: about $1.17 if each ran once.
Gulf boards run only for Gulf seekers; remote boards only for remote seekers.

## 3. Free sources ($0)

| Source | Access | Cache | Notes |
|---|---|---|---|
| Himalayas | free JSON API | 24 h | must credit Himalayas |
| Remotive | free API | 6 h | must credit; max about 4 fetches a day |
| Jobicy | free API | 1 h | keep canonical URL and credit |
| Remote OK | free API | 1 h | link back, never use their logo |
| Adzuna | official API | per call | off until `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` set; no UAE/Saudi/Egypt |
| Jooble | official API | per call | off until `JOOBLE_API_KEY` set; main Gulf/Egypt coverage |
| Local index | Plato's own DB | n/a | no Apify spend; covers repeat searches |

## 4. Company ATS sources

Greenhouse, Lever, Workable, Ashby. Fetched through one bundled Apify actor per search (price not itemized yet, measure it in `usage_events`). These are the only sources with a direct apply adapter; boards that link to one of them are routed to it.

## 5. Not built (4 of the 20 requested)

| Source | Reason |
|---|---|
| FlexJobs | only actor returned 0 results, $0.09 per run |
| Upwork | actor timed out; gigs, not jobs |
| Contra | actors scrape freelancer profiles, not jobs |
| Toptal | actor scrapes its talent network, not jobs |

## 6. Cost per seeker search (Apify)

Measured on the original boards only. The new boards are not in these numbers yet.

| Scenario | Apify cost |
|---|---|
| Default budget 200, 1 country | about $0.56 |
| Default budget, 2 countries | about $1.02 |
| Budget 2000, 1 country | about $2.55 |
| Theoretical ceiling | about $3.30 |

A Gulf search adds Bayt + Naukrigulf + GulfTalent per title; a remote search adds the remote boards. Naukrigulf dominates. Paid only when the local index does not already cover the search.

## Switches

- `DISABLED_BOARDS=WELLFOUND,WEWORKREMOTELY` turns boards off without a deploy.
- Swapping a broken actor is one line in the board's file in `adapters/boards/`.
- Get owner/lawyer sign-off on scraped-board terms before launch.
