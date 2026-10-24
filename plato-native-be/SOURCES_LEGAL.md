# Job sources: legal and technical check

> **Update 2026-10-13: Apify boards added at the owner's request** ("use Apify as we always do"). Six of the sources below that had no official feed are now run through Apify actors, like the existing boards. The legal notes in the table are unchanged: Apify only does the fetching, **the sites' terms still apply**. Each Apify board can be switched off with `DISABLED_BOARDS=NAME,NAME` (for example `WELLFOUND,WEWORKREMOTELY`) without a deploy. See "Apify boards" below.

Checked 2026-10-13. **This is a developer's reading of public pages, not legal
advice, and terms change.** Get the owner's (or a lawyer's) sign-off before
launch, and re-check on each provider's terms page.

**Evidence level:** `official` = I read the provider's own page. `secondary` =
only search snippets or third-party tools describe it. `none` = nothing found.

Rules applied to every source: (1) **no scraping** of a site whose terms bar it
or that has no official feed; (2) the card links to the provider's own listing
and credits it ("Original posting · via X"); (3) **no auto-apply** on these
sources (they are manual-apply only, see `ats-detect.ts`); (4) respect each
provider's stated rate limits (cached in `open-feeds.adapter.ts`).

| # | Source | Official API / feed? | Terms found | Decision | Evidence |
|---|---|---|---|---|---|
| 1 | Himalayas | Yes, free JSON API, no key (`himalayas.app/jobs/api`) | Visible link back to himalayas.app and a mention that data is sourced from Himalayas. 20 jobs per page, cursor paging, refreshed every 24 h, HTTP 429 over limit | **Integrated** (24 h cache) | official |
| 2 | We Work Remotely | RSS feed (open, attribution) and a separate API | RSS: open to anyone with attribution. API terms (per search snippet): do not bypass WWR when applying, do not use it to build a job search service, no WWR branding | **Not integrated.** Plato is a job search service; ask hello@weworkremotely.com for permission first | secondary (their pages returned 403 to my fetch) |
| 3 | Remotive | Yes, `remotive.com/api/remote-jobs` | Link back and name Remotive as the source or access ends; listings delayed 24 h; fetch at most ~4 times a day, over 2 requests a minute are blocked; do not submit Remotive jobs to third-party sites; no collecting signups from listings | **Integrated** (6 h cache, one request per fetch). Do not use listings to collect emails | official |
| 4 | Jobgether | None found | None found | **Not integrated** | none |
| 5 | Jobicy | Yes, `jobicy.com/api/v2/remote-jobs`, no key | Keep Jobicy as the original source and its canonical URL, credit it, do not present listings as your own; no individual permission needed; last 7 days, 3 h delay; sync at most hourly; defer on HTTP 429 | **Integrated** (1 h cache) | official |
| 6 | Remote OK | Yes, `remoteok.com/api` | Followed (not nofollow) link back to the listing and mention Remote OK, or API access is suspended; do not use their logo without written permission | **Integrated** (1 h cache). We link to their listing URL and never use their logo | official |
| 7 | Working Nomads | A public `exposed_jobs` JSON feed exists (seen via third-party tools) | No terms found | **Not integrated** until its terms are read; cheap to add | secondary |
| 8 | Wellfound | None (the AngelList API is gone) | Automated access outside its official API is barred (secondary claim); bot protection | **Not integrated** | secondary |
| 9 | Upwork | Official API exists but needs an approved app; it lists gigs, not jobs | Not read | **Not integrated** (gig marketplace; revisit) | none |
| 10 | Contra | Not checked | Not read | **Not integrated** | none |
| 11 | Toptal | Not checked (a talent network, not a public job board) | Not read | **Not integrated** | none |
| 12 | Arc | Not checked | Not read | **Not integrated** | none |
| 13 | FlexJobs | Not checked (paid subscription site) | Not read | **Not integrated** | none |
| 14 | NoDesk | Not checked | Not read | **Not integrated** | none |
| 15 | Dynamite Jobs | Not checked | Not read | **Not integrated** | none |
| 16 | Bayt | No official public API found (vendor claim) | Not read; Cloudflare-protected | **Not integrated.** Gulf coverage comes from Jooble | secondary |
| 17 | GulfTalent | Nothing found | Nothing found | **Not integrated** | none |
| 18 | Naukrigulf | A public-facing search API is used by scraper vendors | Not read | **Not integrated** | secondary |
| 19 | Adzuna | Yes, official API (`api.adzuna.com`), free `app_id` and `app_key` from developer.adzuna.com | Search parameters read from the docs. Attribution wording ("Jobs by Adzuna" is reported) and free-tier limits (reported 25/min, 250/day) are **unverified**. Its country list (third party) has no UAE, Saudi Arabia or Egypt | **Integrated, off until keys are set** | official (docs) / secondary (terms) |
| 20 | Jooble | Yes, official API; the key comes from a request form | Endpoint (`POST https://jooble.org/api/{key}`) taken from third-party guides; terms page and country list **not read** | **Integrated, off until a key is set.** This is the Gulf and Egypt coverage; **check the first live response and the terms before launch** | secondary |

## Result

- **6 of the 20** are built: Remotive, Jobicy, Remote OK and Himalayas run now (no key, no cost); Adzuna and Jooble run once their keys are in `.env`.
- **1 pending permission:** We Work Remotely.
- **13 not built**, because there is no official feed or I could not confirm that their terms allow it. The goal of 20 cannot be met by scraping without permission. Next steps for any of them: read the provider's terms, or email them for a feed or partnership.
- Gulf and Egypt coverage: Jooble (once keyed) plus LinkedIn and the ATS sources. Bayt, GulfTalent and Naukrigulf stay out until a feed or permission exists.

## Environment

| Variable | Effect |
|---|---|
| `JOOBLE_API_KEY` | Turns on Jooble |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Turn on Adzuna (countries it serves only) |
| `FRESHNESS_CHECK=off` | Stops the background check for closed postings |

Run `npm run prisma:push` once (new job sources, and new `jobs` fields: `profession`, `employment`, `dedupe_key`, `expired_at`, `checked_at`).

## Live check

On 2026-10-13 one small read-only request to each of Remotive, Jobicy, Remote OK and Himalayas confirmed the field mapping against the real payloads (titles, companies, salaries, dates and listing URLs all mapped). Jooble and Adzuna were **not** called (no keys).

## Apify boards (added)

All run through `discovery/adapters/boards/*.ts` with the same fan-out, budget and failure handling as Indeed or Wuzzuf. Only actors with **limited permissions** were used. Three candidates (`jupri/jooble`, `jupri/flexjobs-scraper`, `mscraper/dynamitejobs-jobs-scraper`) ask for **full access to your Apify account** and were not approved: Dynamite Jobs uses another actor (`rl1987`), and Jooble stays on its official API key.

**Still not integrated (4 of the 20), with the reason:**
- **FlexJobs:** the only keyword-capable limited-permission actor (`easyapi/flexjobs-job-search-scraper`) returned **0 results** in a test and charges **$0.09 per run**. FlexJobs is also a paid-subscription site.
- **Upwork:** `neatrat/upwork-job-scraper` **timed out** in a test (Upwork guards its pages). It lists freelance gigs, not employment.
- **Contra:** the Apify actors found only scrape freelancer profiles, not jobs.
- **Toptal:** the actor found scrapes its talent network, not job listings.

| Board | Actor | Runs for | Price (Apify, free tier) | Output checked |
|---|---|---|---|---|
| Bayt | `goat255/bayt-scraper` | UAE, Saudi Arabia, Egypt, Qatar, Kuwait, Bahrain, Oman, Jordan, Lebanon, Morocco | about $0.002 per job | documented example |
| Naukrigulf | `bovi/naukrigulf-jobs-scraper` | UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman | about **$0.009 per job** (the priciest) | live run, 3 items |
| GulfTalent | `shahidirfan/GulfTalent-Job-Scraper` | UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman | about $0.001 per job + $0.005 start | documented example |
| We Work Remotely | `bovi/weworkremotely-scraper` (reads the RSS feed) | remote seekers, once per title | about $0.0015 per job | documented example |
| Working Nomads | `benthepythondev/workingnomads-jobs-scraper` | remote seekers, once per title | not published | live run, 3 items |
| Wellfound | `igolaizola/wellfound-jobs-scraper` | remote seekers, **one run** (it cannot filter by title) | about $0.0005 per job + start | documented example |
| Arc | `parseforge/arc-dev-jobs-scraper` | remote seekers, once per title, capped at 10 jobs | **$0.025 per job** (about $0.25 per run) | live run, 2 items |
| Dynamite Jobs | `rl1987/dynamitejobs-scraper` | remote seekers, once per title | about $0.001 per job | live run, 3 items |
| Jobgether | `automation-lab/jobgether-remote-jobs-scraper` | remote seekers, once per title; uses its own accepted-countries list | $0.005 per run + under a cent per job | live run, 3 items |
| NoDesk | `parseforge/nodesk-remote-jobs-scraper` | remote seekers, **one capped run** (15 jobs, no keyword filter) | **$0.021 per job** (about $0.32 per run) | live run, 2 items |

Notes:
- **Higher-risk boards:** Wellfound (its terms reportedly bar automated access) and We Work Remotely (its API terms bar using the data to build a job search service; the RSS is open with attribution). Wellfound and We Work Remotely are the first to switch off if there is any complaint.
- **Cost:** a Gulf search adds Bayt + Naukrigulf + GulfTalent runs per title, a remote search adds the three remote boards. At the default limits this is cents to well under a dollar per uncovered search; Naukrigulf dominates. These are only paid when the local index does not already cover the search (Apify budget 0), as before.
- **Manual apply only:** like every non-ATS board, applications go through the original posting. Cards link back and credit the board ("Original posting · via Bayt").
- **Reliability:** most of these actors are small (1 to 20 users). Expect to swap actors if one breaks; the actor id is one line in the board file.

**Verified live (2026-10-13):** Naukrigulf, Working Nomads, Arc, NoDesk, Jobgether and Dynamite Jobs were each run once with a 2 to 3 result limit (about $0.2 in total) and their real output matched the mappers. Bayt, GulfTalent, We Work Remotely and Wellfound follow the actors' documented examples and were not run.
