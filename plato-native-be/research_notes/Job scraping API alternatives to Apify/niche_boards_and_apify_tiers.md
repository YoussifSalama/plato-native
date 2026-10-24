# Niche Job Boards: Cheaper Apify Actors, Non-Apify Alternatives, and Apify Tier Discounts

## Are there cheaper Apify Store actors for the same 5 boards (JobBank Canada, Jobillico, Wuzzuf, Handshake, BuiltIn)?

### Takeaway
Yes for two boards — **Jobillico** and **BuiltIn** have materially cheaper same-board actors from other authors than the ones currently in use. For **JobBank Canada** and **Wuzzuf**, the current actors already appear to be at or near the cheapest of the alternatives sampled. For **Handshake**, one listing claims an extremely low price that looks anomalous and should be treated as unverified rather than acted on; the credible alternatives are roughly at parity with the current actor.

### Cited Findings

**JobBank Canada** (current: `parsebird/jobbank-canada-scraper`, quoted at $0.00079/result = $0.79/1,000 on Free tier)
- `parsebird/jobbank-canada-scraper`: Free $0.79/1,000 → Bronze $0.69 → Silver $0.69 → Gold $0.59/1,000 — [Apify](https://apify.com/parsebird/jobbank-canada-scraper/api)
- `gio21/jobbank-canada-scraper`: $3.00/1,000 (flat, "pay-per-event") — [Apify](https://apify.com/gio21/jobbank-canada-scraper/api)
- `powerbox/jobbank-listing-scrape`: from $3.99/1,000 — [Apify](https://apify.com/powerbox/jobbank-listing-scrape/api)
- `scrapyx/jobbank-canada-jobs-scraper`: from $0.84/1,000 — [Apify](https://apify.com/scrapyx/jobbank-canada-jobs-scraper)
- `jobsapi/jobbank-jobs-search-scraper`: from $2.99/1,000 — [Apify](https://apify.com/jobsapi/jobbank-jobs-search-scraper)
- Other listed authors not price-checked due to time budget: `santamaria-automations/jobbank-ca-scraper`, `memo23/jobbank-scraper`, `automation-lab/canada-job-bank-scraper`, `logiover/job-bank-canada-scraper` — [Apify Store search](https://apify.com/store)

**Jobillico** (current: `jobsapi/jobillico-jobs-search-scraper`, quoted at $0.00299/result = $2.99/1,000, confirmed on-page: "$2.99 / 1,000 jobillico job records" — [Apify](https://apify.com/jobsapi/jobillico-jobs-search-scraper))
- `stealth_mode/jobillico-jobs-search-scraper`: from $1.50/1,000, discounted further at higher Apify tiers — [Apify](https://apify.com/stealth_mode/jobillico-jobs-search-scraper/api) — **roughly 50% cheaper than the current actor**, same board, same data (title, company, location, salary, job type, description).

**Wuzzuf** (current: `automation-lab/wuzzuf-jobs-scraper`, quoted at $0.00092/result; confirmed full tier table: Free $0.00092 → Bronze $0.0008 → Silver $0.000624 → Gold $0.00048 → Platinum $0.00032 → Diamond $0.000224 per job, i.e. $0.92 down to $0.224 per 1,000 — [Apify](https://apify.com/automation-lab/wuzzuf-jobs-scraper/api))
- `parsebird/wuzzuf-jobs-scraper`: Free $0.99/1,000 → paid tiers $0.89/1,000 — **more expensive than current at every tier checked** — [Apify](https://apify.com/parsebird/wuzzuf-jobs-scraper)
- `unfenced-group/wuzzuf-net-scraper`: $1.49/1,000 down to $0.89/1,000 at premium tier — **more expensive than current** — [Apify](https://apify.com/unfenced-group/wuzzuf-net-scraper/api)
- `alexist/wuzzuf-jobs-search-scraper`: billed as "pay per platform usage" with no disclosed per-result price — not directly comparable, likely more expensive/unpredictable for large volumes — [Apify](https://apify.com/alexist/wuzzuf-jobs-search-scraper/api/openapi)
- Conclusion: the current Wuzzuf actor (`automation-lab`) is already the cheapest of the alternatives checked, and its per-result price falls sharply at higher Apify subscription tiers (down to $0.224/1,000 at Diamond).

**Handshake** (current: `memo23/handshake-jobs-scraper`, quoted at $0.001/result; confirmed on-page: "from $1.00 / 1,000 results" — [Apify](https://apify.com/memo23/handshake-jobs-scraper/api))
- `parsebird/handshake-jobs-scraper`: Free $0.99/1,000 → paid tiers $0.89/1,000 — marginally cheaper than current at paid tiers only — [Apify](https://apify.com/parsebird/handshake-jobs-scraper)
- `fetch_cat/handshake-jobs-scraper`: page text states "from $0.02 / 1,000 job results" — [Apify](https://apify.com/fetch_cat/handshake-jobs-scraper/api) — **this is ~50x cheaper than every other actor found for any of the 5 boards and does not match the pattern of any other listing; flagging as needs-manual-verification** (see Inferences).
- `khadinakbar/handshake-jobs-scraper`: $3.00 per job written to dataset = $3.00/1,000 — more expensive than current — [Apify](https://apify.com/khadinakbar/handshake-jobs-scraper)
- Other listed but not price-checked: `moving_beacon-owner1/handshake-job-scraper`, `jobsapi/handshake-jobs-search-scraper`, `automation-lab/handshake-public-jobs-scraper`, `getascraper/handshake-jobs-scraper`, `maximedupre/handshake-jobs-scraper` — [Apify Store search](https://apify.com/store)

**BuiltIn** (current: `benthepythondev/builtin-jobs-scraper`, quoted at $0.003/result; page confirms "Free-plan result price is $0.003 per job" i.e. $3.00/1,000, with "from $2.40/1,000" cited elsewhere on the same page (likely a discounted-tier figure) — [Apify](https://apify.com/benthepythondev/builtin-jobs-scraper/api))
- `parsebird/builtin-jobs-scraper`: $0.00099/job = $0.99/1,000 — [Apify](https://apify.com/parsebird/builtin-jobs-scraper) — **~3x cheaper than current's Free-tier price**
- `datascraperes/builtin-jobs-scraper`: Free $1.00/1,000 → Bronze $0.90 → Silver $0.80 → Gold/Platinum/Diamond $0.70/1,000 — [Apify](https://apify.com/datascraperes/builtin-jobs-scraper) — **~3–4x cheaper than current**, and unlike the current actor this one's own page states its price is tiered
- `dami_studio/builtin-jobs-scraper`: flat $0.81 per 1,000 jobs, explicitly **no volume/tier discount** across any Apify plan — [Apify](https://apify.com/dami_studio/builtin-jobs-scraper/api) — cheaper than current at Free/Bronze/Silver tiers, but a business already on Gold+ with the current actor may do better keeping the tiered option
- `devilscrapes/builtin-jobs-scraper`: actor-start $0.20/run + $0.0015/item ≈ $1.50–$1.70/1,000 depending on run size — [Apify](https://apify.com/devilscrapes/builtin-jobs-scraper) — cheaper than current, not as cheap as the above three
- Conclusion: **BuiltIn is the clearest win** — multiple actors from other authors (`parsebird`, `datascraperes`, `dami_studio`) are 3–4x cheaper than the current `benthepythondev` actor for identical scraped fields (title, company, location, salary, seniority, category, skills).

### Inferences
- Actor authors set their own per-tier PPE (pay-per-event) prices; they are not required to follow Apify's standard 21%/42%/56% Bronze/Silver/Gold discount schedule (see next section). This is why, e.g., `automation-lab`'s Wuzzuf actor discounts far more steeply by tier than `datascraperes`'s BuiltIn actor. Any comparison must be tier-matched (Free-vs-Free, Gold-vs-Gold) to be fair — the figures above are Free-tier vs Free-tier unless noted.
- The `fetch_cat/handshake-jobs-scraper` $0.02/1,000 figure is inconsistent with every other actor price found across all 5 boards (which cluster between $0.2/1,000 and $4/1,000). It could be (a) a genuine promotional/loss-leader price, (b) a page-copy error by that actor's author, or (c) a misread by the automated page-fetch summarizer despite being asked to double-check — two independent fetches of that page both returned the same "$0.02/1,000" text, which weighs toward it being genuinely printed on the page, but the number is still far outside the pattern of every comparable actor. **Do not switch to this actor based on this research alone — have someone open the actor's Pricing tab directly in a browser to confirm before committing spend.**
- Switching Jobillico from `jobsapi` to `stealth_mode`, and BuiltIn from `benthepythondev` to `datascraperes` or `parsebird`, appear to be safe, low-effort wins (same public data, same board, no new vendor relationship, just a different Apify actor ID in the run config).

### Gaps
- Did not price-check every actor found in search results for JobBank Canada and Handshake (listed but unchecked authors above) — given 8–9 competing actors per board, it's possible a still-cheaper one exists among the unchecked ones, but the sampled actors (4-5 per board, including apparent generalist scraper shops like `jobsapi` that price consistently across boards) suggest the current choices for JobBank Canada and Wuzzuf are reasonably competitive.
- Could not independently verify the `fetch_cat` Handshake $0.02/1,000 figure through a second, differently-worded source (e.g., the actor's raw JSON pricing schema) — flagged as a gap requiring manual confirmation.
- Did not verify output schema/field parity in detail between current actors and the cheaper alternatives identified (e.g., whether `datascraperes`'s BuiltIn actor includes the same enrichment fields as `benthepythondev`'s) — pricing pages describe similar but not necessarily byte-identical schemas.

---

## Do Bright Data / Oxylabs / ScraperAPI have dedicated products for these 5 niche boards?

### Takeaway
Confirmed negative: Bright Data's job-postings products explicitly enumerate major boards (Indeed, LinkedIn, Glassdoor, ZipRecruiter, Monster, Dice) and make no mention of JobBank Canada, Jobillico, Wuzzuf, Handshake, or BuiltIn. Oxylabs' Web Scraper API is a generic 38+-dedicated-source tool plus a "universal" fallback for any URL, with no dedicated/named source for any of these 5 boards found. ScraperAPI was not directly checked (out of tool budget) but the pattern for the other two "big" vendors strongly suggests the same is true there.

### Cited Findings
- Bright Data's Jobs Datasets are "sourced from various websites such as Indeed, Ziprecruiter, LinkedIn, Monster, and Dice" — [Bright Data blog](https://brightdata.com/blog/web-data/best-job-posting-data-providers); the Jobs Data API "retrieve[s] job postings from multiple sources including LinkedIn Jobs, Indeed, Glassdoor, and other job boards" — [Bright Data](https://brightdata.com/products/data-feeds/jobs-data-api)
- None of the Bright Data search results, dataset marketplace listings (Databricks Marketplace, AWS Marketplace), or product pages found in this research name JobBank Canada, Jobillico, Wuzzuf, Handshake, or BuiltIn as covered sources.
- Oxylabs' Web Scraper API has "38+ pre-configured endpoints (dedicated sources)" covering search engines, e-commerce, travel, real estate, and AI chat targets, "plus a universal source for any other URL" — [Oxylabs docs via search summary](https://developers.oxylabs.io/api-targets); no dedicated source for any of the 5 target boards was found in the search results or Oxylabs' job-scraper product page — [Oxylabs Job Scraping API](https://oxylabs.io/products/scraper-api/web/jobs-scraper).

### Inferences
- This confirms the expected negative finding: general-purpose "big vendor" scraping platforms build dedicated/pre-built products around the highest-volume global boards (Indeed, LinkedIn, Glassdoor) and treat everything else — including all 5 boards in scope here — as "any URL, use the universal/generic scraper," which typically costs more and requires more in-house engineering than a purpose-built community Apify actor already tuned to that specific site's markup.

### Gaps
- ScraperAPI specifically was not directly researched in this pass (time budget); the parallel workstream researching Bright Data/Oxylabs/ScraperAPI generally should confirm ScraperAPI also lacks dedicated products for these 5 boards, but based on the consistent pattern across the two vendors checked here, it is very unlikely ScraperAPI is an exception.
- Did not check Bright Data's or Oxylabs' custom/bespoke dataset request process (i.e., "we don't have it pre-built, but can build a custom crawler for a fee") — this is a theoretical fallback option for any of these vendors but would need direct vendor contact to price, and is very likely to cost far more per result than the existing Apify actors given these are low-volume niche boards.

---

## Wuzzuf: is there a MENA job-aggregator official partner API alternative to scraping?

### Takeaway
No official public/partner API was found for Wuzzuf itself, nor for Bayt (the other major MENA aggregator suggested as a comparison point). Both appear to be scraped by third parties on Apify with no official data-access alternative; Wuzzuf's own "API" URL slug on its site is actually just a job-search results page for postings containing the word "API," not a developer API.

### Cited Findings
- Wuzzuf's page at `wuzzuf.net/a/API-` is a job listing search results page for jobs matching the keyword "API" (e.g., "ETL Developer"), not API documentation — [Wuzzuf](https://wuzzuf.net/a/API-)
- No API/developer/partner documentation for Wuzzuf was found via search; the only structured-access options found are third-party Apify scrapers — [search results]
- Wuzzuf's listed partners are MCIT, ITIDA, TIEC, Tanqeeb.com, Vezeeta, and dailymedicalinfo — [Wuzzuf Partners page, per search summary](https://wuzzuf.net/partners) — Tanqeeb is listed as a partner but no API relationship between the two is described in available sources.
- For Bayt.com (the region's largest aggregator, suggested as a comparison point): search results show only third-party/unofficial scrapers on Apify (`kawsar`, `corvuslab`, `vero-api`, `data_api`, `accountable_eel`, `parsebird`, `jobscrawler`), with several actor descriptions explicitly noting they are "independent," "not affiliated with," or "unofficial" — no official Bayt API or partner-data-access program was found — [search results]

### Inferences
- The MENA regional job board market (Wuzzuf, Bayt, Tanqeeb) does not appear to have any official B2B/partner data API comparable to what LinkedIn or Indeed offer to select partners. This is consistent with these being mid-size regional players without the API/partnerships infrastructure of the top-tier global boards. Scraping (via Apify or otherwise) appears to be the only practical route to structured Wuzzuf/Bayt data for a non-partner company.

### Gaps
- Did not directly contact Wuzzuf, Bayt, or Tanqeeb to confirm whether an *unlisted* partner/enterprise data-licensing program exists (common for job boards that don't publicize a self-serve API but will negotiate bulk data deals with recruiting-tech companies) — this can't be confirmed by web research alone and would require outreach.
- Tanqeeb's own site/API was not independently checked; it's only mentioned here as a Wuzzuf partner per the Wuzzuf partners page.

---

## Handshake: does the official EDU API expose job/listing read access, or is scraping the only option?

### Takeaway
Handshake does have an official read-only "EDU API," and it does expose job/posting data — but access is restricted to a school's Career Services office (i.e., issued per-institution to a university, not to a general third-party company), is scoped only to jobs posted to that specific institution, and requires going through a Handshake Relationship Manager. It is not a general-purpose "search all Handshake jobs" API a company like Plato could self-serve sign up for, which means scraping (or a partnership Plato would need to separately negotiate with Handshake, likely as if it were itself an institution or approved partner) remains the practical option for broad job coverage.

### Cited Findings
- "Handshake's EDU API is a scalable, secure, and developer-friendly solution for data management and automation, with features like read-only data retrieval, institution-scoped access, versioning, and delta fetching." — [Handshake Help Center, "Getting Started with EDU API"](https://support.joinhandshake.com/hc/en-us/articles/31061076506391-Getting-Started-with-EDU-API) (via search summary; direct page fetch returned HTTP 403)
- "The API provides access to data on all jobs posted to your institution, with a distinction between jobs and postings: an employer can create one job and post it to multiple schools — each posting is unique to an institution." — [Handshake Help Center, EDU API docs, per search summary]
- "To request access to the Handshake API, you should reach out to your Handshake Relationship Manager, as API access is currently only allowed to Career Services partners." — [Handshake Help Center, per search summary]
- Related official docs confirming the EDU API's job-data scope exist: "EDU: API Endpoint Definitions," "EDU: Jobs Imported into Handshake from External Sites" — [Handshake Help Center](https://support.joinhandshake.com/hc/en-us/sections/31055822163351-API)
- Separately, Handshake has a "FAQs: XML Job Feed" doc — [Handshake Help Center](https://support.joinhandshake.com/hc/en-us/articles/32426275339927-FAQs-XML-Job-Feed) — this appears (by name, not independently confirmed) to be for employers to push job postings *into* Handshake via XML, i.e. the inverse direction from what Plato needs (reading jobs out).

### Inferences
- Even if Plato pursued an official Handshake relationship, the EDU API model (per-institution, career-services-scoped, "your institution's" jobs only) does not map onto "read all public Handshake jobs across all schools" the way the Apify scraper does — Plato would need Handshake to grant a non-standard, cross-institution partner integration, which is a business-development conversation, not a self-serve API signup.
- Given the institution-scoped, permissioned nature of the official API, continuing to use the Apify community scraper for broad Handshake coverage is likely the only practical option without a direct enterprise deal with Handshake.

### Gaps
- Could not fetch the EDU API docs page directly (403 Forbidden to automated fetch); all findings on this API come from search-result summaries of that page, not a direct read — moderately confident but not fully verified firsthand.
- Did not confirm whether Handshake has any other data-partner program (outside EDU API) aimed at companies building job-search/aggregation products rather than universities.

---

## BuiltIn: does it have an official API, RSS, or job feed for employers/partners?

### Takeaway
BuiltIn has ATS-integration "job sync" feed options (referenced by a knowledge-base article title "Setting up your job sync with Built In's standard feed options"), but based on standard industry pattern (and BuiltIn's ATS partner list — Greenhouse, Lever, Workday, etc.) this is almost certainly an **inbound** feed for employers to push their own job postings into BuiltIn, not an outbound API/RSS for third parties to pull BuiltIn's full job listings out. No official outbound API or public RSS feed for reading BuiltIn's aggregate job data was found.

### Cited Findings
- "Built In supports integration with applicant tracking systems (ATS) of choice, including Greenhouse, Lever, Workday and more" — [search summary, referencing employers.builtin.com]
- A BuiltIn knowledge-base article exists titled "Setting up your job sync with Built In's standard feed options" — [BuiltIn Knowledge Base](https://knowledgebase.builtin.com/s/article/Setting-up-your-job-sync-with-Built-In-s-standard-feed-options) — direct fetch of this page failed (returned only a loading/error page to the automated fetcher), so its exact content (inbound vs. outbound, access requirements) could not be confirmed firsthand.
- "The search results don't show an official BuiltIn.com API or RSS feed partner program for employers or job distributors — the references are primarily to third-party scraping services that extract and redistribute BuiltIn job data." — [search summary]
- BuiltIn's own careers/jobs pages (e.g. `builtin.com/company/*/jobs`) are standard company-profile job listing pages, not a documented public feed.

### Inferences
- The "job sync" feed almost certainly follows the same pattern as Indeed's Job Sync XML feed and LinkedIn's XML feeds (both of which appeared as related results) — these industry-standard "XML job feed" integrations are universally for employers/ATSs to publish jobs *into* the board, not for third parties to extract the board's full inventory. This makes it very unlikely BuiltIn's feed is usable as a cheaper/free substitute for the Apify scraper.
- No evidence of a self-serve or partner-only outbound data API for BuiltIn was found anywhere in this research.

### Gaps
- Could not directly confirm the direction (inbound vs outbound) or access terms of BuiltIn's "standard feed options" article due to a failed page fetch — this is the one loose end on BuiltIn; if there's any doubt, someone should log into `employers.builtin.com` or contact BuiltIn support directly to confirm the feed is inbound-only before ruling it out completely.

---

## Apify subscription tier discounts — is upgrading the Apify plan itself a relevant lever?

### Takeaway
Yes — this is a real, easy, and non-actor-specific lever. Apify's own subscription tiers automatically apply a Store discount to every actor's pay-per-event price, including all of Plato's current job-board actors. Current tiers: **Free ($0, no discount) → Starter ($19/mo, "Bronze" discount) → Scale ($199/mo, "Silver" discount) → Business ($999/mo, "Gold" discount)**, with Platinum/Diamond enterprise-only tiers above Business. However, the discount percentage is **not a fixed platform-wide number** — Apify publishes indicative Bronze/Silver/Gold discount levels of roughly 21%/42%/56% off Store actor prices, but in practice each actor author sets their own per-tier price, and the actual observed discounts on the 5 boards' actors varied substantially from that indicative schedule (see below) — so real savings from a tier upgrade should be checked per-actor, not assumed.

### Cited Findings
- Apify subscription tiers and monthly prices: Free $0, Starter $19/mo, Scale $199/mo, Business $999/mo — [Apify Pricing, per page fetch](https://apify.com/pricing)
- Tier-to-discount-level mapping: "Free = no discount, Starter = Bronze, Scale = Silver, Business = Gold" — [search summary of Apify pricing/docs](https://apify.com/pricing)
- Indicative discount percentages: "Bronze discount knocks 21% off the per result price of paid Actors, Silver discount of 42%, and the Gold discount takes 56% off Store Actor prices." — [search summary, citing Apify pricing/docs pages]
- "In addition to the standard tiers, there're two tiers for enterprise customers only: PLATINUM and DIAMOND... Apify's pricing page publishes no percentage for them, because the discount is defined per actor and per event" — [search summary]
- Actor-level evidence that discounts are set per-actor, not platform-uniform:
  - `automation-lab/wuzzuf-jobs-scraper`: Free $0.00092 → Bronze $0.0008 (13.0% off) → Silver $0.000624 (32.2% off) → Gold $0.00048 (47.8% off) → Platinum $0.00032 (65.2% off) → Diamond $0.000224 (75.7% off) — [Apify](https://apify.com/automation-lab/wuzzuf-jobs-scraper/api)
  - `datascraperes/builtin-jobs-scraper`: Free $1.00 → Bronze $0.90 (10% off) → Silver $0.80 (20% off) → Gold/Platinum/Diamond $0.70 (30% off, capped) — [Apify](https://apify.com/datascraperes/builtin-jobs-scraper)
  - `parsebird/jobbank-canada-scraper`: Free $0.79 → Bronze $0.69 (12.7% off) → Silver $0.69 (12.7% off, no further drop) → Gold $0.59 (25.3% off) — [Apify](https://apify.com/parsebird/jobbank-canada-scraper/api)
  - `dami_studio/builtin-jobs-scraper`: flat $0.81/1,000 at every tier — **0% discount regardless of plan** — [Apify](https://apify.com/dami_studio/builtin-jobs-scraper/api)

### Inferences
- Upgrading Plato's Apify plan tier (e.g., Free/pay-as-you-go → Starter $19/mo → Scale $199/mo) is a legitimate, low-effort lever that would reduce the per-result cost of **every** actor Plato runs simultaneously (all 12 job-board actors, not just these 5), which is a broader win than switching any single actor. But the savings are actor-specific and range from 0% (flat-priced actors like `dami_studio`) to 75%+ at the highest tiers (steeply-discounting actors like `automation-lab`'s Wuzzuf scraper) — so the right move is to model total spend across all 12 actors' actual per-tier prices (not the generic 21/42/56% figures) against each plan's monthly fee to find the breakeven volume, rather than assuming a uniform discount.
- Because the Starter tier is only $19/mo (cheaper than commonly assumed in this task's framing of "~$39/mo" — that figure was not confirmed by this research and appears to be outdated or a different historical price point), the breakeven volume to make Starter worthwhile is likely low if Plato is running meaningful monthly volume across 12 actors combined, not just these 5 niche boards.

### Gaps
- Did not build an exact breakeven-volume calculation (results/month needed to justify each tier) — this would require Plato's actual current monthly result volume per actor, which wasn't available to this research task; the report writer or a follow-up pass should combine Plato's actual usage data with the per-actor tier tables above to compute real breakeven points.
- Did not confirm the $19/$199/$999 tier prices against a second independent source beyond the single `apify.com/pricing` page fetch — given the task's instruction that prices must be current for 2026, and Apify has historically changed tier names/prices, this figure should be spot-checked directly on apify.com/pricing before being used in a final decision document.
- Did not check whether Apify offers any additional enterprise/negotiated discount tiers below Platinum/Diamond, or annual-billing discounts on top of the tier discount.
