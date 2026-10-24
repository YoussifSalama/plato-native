# SerpApi and Similar SERP-API Providers as Alternatives for Google Jobs Data

## What does SerpApi charge for its Google Jobs API — price per search, price per result, and results per search?

### Takeaway
SerpApi's Google Jobs API returns up to 10 job results per search/page, and is billed per *search* (not per result) under the same plan tiers as all its other engines; normalized to $/1,000 job results this ranges from ~$2.50 (entry paid tier) down to ~$0.55 (top self-serve tier) as of the pricing page fetched in September 2026 — still cheaper per-result than SerpApi's own headline "$/1,000 searches" number suggests, but consistently more expensive than DataForSEO's Google Jobs endpoint on the same normalized basis.

### Cited Findings
- SerpApi's Google Jobs API documentation states: "Up to `10` results are returned per page." — [Google Jobs API - SerpApi](https://serpapi.com/google-jobs-api)
- SerpApi pricing tiers (fetched from the live pricing page, Sept 2026): Free $0/mo (250 searches), Starter $25/mo (1,000 searches), Developer $75/mo (5,000 searches), Production $150/mo (15,000 searches), Big Data $275/mo (30,000 searches), Searcher $725/mo (100,000 searches), Volume $1,475/mo (250,000 searches), Infrastructure $2,750/mo (500,000 searches), with Cloud tiers scaling further from $3,750/mo (1M searches) up to $106,050/mo (54M searches) — [SerpApi Pricing](https://serpapi.com/pricing)
- "Only successful searches are counted toward your monthly searches. Cached, errored, and failed searches are not." — [SerpApi Pricing](https://serpapi.com/pricing)
- A secondary aggregator source states SerpApi's Google Jobs entry point is effectively ~$75/mo, calling it "a search-results API, not a jobs database — great for what a searcher sees on Google, weaker for structured, deduplicated job data" — [JobsPipe: The best jobs APIs in 2026](https://jobspipe.dev/blog/best-jobs-api-2026)
- One aggregator (clura.ai) states "SerpApi charges $50/month for 5,000 searches," which conflicts with the primary SerpApi pricing page figure of $75/month for 5,000 searches (Developer tier) fetched directly from serpapi.com — [Clura: Google Jobs Has No Public API](https://clura.ai/blog/google-jobs-api) contradicted by [SerpApi Pricing](https://serpapi.com/pricing)

### Inferences
- Normalizing SerpApi's plan pricing to $/1,000 job results, assuming 10 results/search (SerpApi's own stated figure):
  - Starter ($25/1,000 searches = 10,000 results): **$2.50 / 1,000 results**
  - Developer ($75/5,000 searches = 50,000 results): **$1.50 / 1,000 results**
  - Production ($150/15,000 searches = 150,000 results): **$1.00 / 1,000 results**
  - Big Data ($275/30,000 searches = 300,000 results): **$0.92 / 1,000 results**
  - Searcher ($725/100,000 searches = 1,000,000 results): **$0.73 / 1,000 results**
  - Volume ($1,475/250,000 searches = 2,500,000 results): **$0.59 / 1,000 results**
  - Infrastructure ($2,750/500,000 searches = 5,000,000 results): **$0.55 / 1,000 results**
- Against the current Apify actor cost of $0.0022/job result ($2.20/1,000 results) plus an extra per-page-fetched fee, SerpApi is cheaper per raw result starting at the Developer tier ($75/mo) and above — but this ignores that SerpApi bills per *search* (i.e., you pay for the full page of 10 even if you only want/use fewer), so real-world effective cost depends on how much of each 10-result page is useful data (duplicate/irrelevant listings reduce the effective $/1,000 *useful* results).
- The $50/5,000-searches figure from Clura is likely stale or an error (possibly reflecting a past promotional price or a misread of the $75 Developer tier); the report writer should treat the SerpApi Developer tier as $75/mo, 5,000 searches per the primary source.

### Gaps
- Could not confirm whether SerpApi's Google Jobs endpoint supports fetching more than the default 10 results per page (e.g., via a "next_page_token" pagination that would still cost one search-unit per page), or whether pagination beyond page 1 returns diminishing/duplicate results, which affects real effective cost per unique result.

## Do SerpApi's plan tiers include a fixed number of searches per month, and what's the effective $/1,000 results at each tier?

### Takeaway
Yes — every SerpApi tier (Free through Infrastructure, then Cloud tiers up to 54M/month) includes a fixed monthly search allotment at a fixed price, and cached/failed searches don't count against the quota; see the full $/1,000-results table computed above under the first question (ranging $2.50 down to $0.55 per 1,000 job results as volume scales, assuming 10 results/search).

### Cited Findings
- Full tier table (Free/Starter/Developer/Production/Big Data/Searcher/Volume/Infrastructure) with fixed monthly search counts, and Cloud tiers scaling in ~$1,925/million-search increments from $3,750/mo (1M) to $106,050/mo (54M) — [SerpApi Pricing](https://serpapi.com/pricing)
- "A cache is served only if the query and all parameters are exactly the same. Cache expires after 1h. Cached searches are free, and are not counted towards your searches per month." — [Google Jobs API - SerpApi](https://serpapi.com/google-jobs-api)
- All plans can add a "speed mode" multiplier (2x–4x base price) for faster/priority processing; higher tiers unlock "Legal Shield" coverage, "ZeroTrace" privacy mode, and priority support — [SerpApi Pricing](https://serpapi.com/pricing)

### Inferences
- The 1-hour cache means near-duplicate queries (same query/location/params run twice within an hour) are effectively free, which could meaningfully reduce real cost if the product re-polls the same job searches frequently (e.g., a recurring "software engineer, Cairo" search run every 30 minutes would get a free cache hit on the second call).
- Because cost per 1,000 results drops substantially at higher tiers, the actual price comparison against Apify depends heavily on projected monthly volume — at low volume (Starter, $25/mo) SerpApi is *more* expensive per 1,000 results ($2.50) than Apify's $2.20/1,000 + page fee; at Developer tier and above SerpApi becomes cheaper.

### Gaps
- No visibility into effective discounts for prepaid/annual commitments, or into whether the Developer-and-above tiers require an annual contract vs. month-to-month (the pricing page fetch did not surface billing-term details).

## Does SerpApi (or a competitor) offer an apply_options/apply_link field showing whether a listing routes to a direct ATS (Greenhouse/Lever/Workable/Ashby) vs. an external site?

### Takeaway
SerpApi's Google Jobs API does return an `apply_options` array with a `title` (source platform name, e.g. "Indeed") and `link` (application URL) per job listing, and SearchApi.io's equivalent returns `apply_link`/`apply_links` with similar source-attributed URLs — but neither provider's documentation explicitly labels or flags whether a given apply link is a direct ATS (Greenhouse/Lever/Workable/Ashby) vs. an aggregator/external site; that classification would have to be inferred downstream by pattern-matching the returned URL/domain, same as with the current Apify actor.

### Cited Findings
- SerpApi's documented `apply_options` example: `"apply_options": [{"title": "Indeed", "link": "https://www.indeed.com/viewjob?jk=...&utm_campaign=google_jobs_apply..."}]` — the `title` field names the routing platform (e.g. "Indeed") and `link` is the direct application URL — [Google Jobs API - SerpApi](https://serpapi.com/google-jobs-api)
- No mention of Greenhouse, Lever, Workable, or Ashby in SerpApi's Google Jobs documentation content that was fetched — [Google Jobs API - SerpApi](https://serpapi.com/google-jobs-api)
- SearchApi.io's Google Jobs Scraper API returns both a single `apply_link` and an `apply_links` array with source attribution (example shown: a direct company careers-page link, "BlackRock Careers") — [SearchApi.io Google Jobs docs](https://www.searchapi.io/docs/google-jobs)
- SearchApi.io documentation, per the fetch performed, does not mention ATS platform detection/classification — [SearchApi.io Google Jobs docs](https://www.searchapi.io/docs/google-jobs)
- DataForSEO's Google Jobs API overview (fetched) does not explicitly document an apply-link/ATS-detection field, though it does return structured job listing data with ranking metadata (`rank_group`, `rank_absolute`) — [DataForSEO Google Jobs Overview](https://docs.dataforseo.com/v3/serp-google-jobs-overview/)

### Inferences
- Since `apply_options`/`apply_links` simply mirror whatever Google's own Jobs SERP surfaces (which itself pulls from the job posting's structured data / the original job board), a listing that natively resolves to Greenhouse/Lever/Workable/Ashby on Google's own results page would presumably show that ATS's domain in the `link` field for both SerpApi and SearchApi.io — meaning the same downstream 4-ATS matching logic the current system uses on the Apify actor's output could likely be reapplied to either provider's `apply_options`/`apply_link` field with no loss of capability, but this was not directly verified against a live example return containing an ATS domain (only an "Indeed" example was found for SerpApi, and a direct-company-careers-page example for SearchApi.io).

### Gaps
- Could not find a live/documented example response where the `apply_options` or `apply_link` field resolves directly to a greenhouse.io, lever.co, workable.com, or ashbyhq.com URL, for either SerpApi or SearchApi.io, to confirm the field reliably surfaces those exact ATS domains rather than always routing through an aggregator (Indeed, LinkedIn, ZipRecruiter, or the employer's own generic careers page).
- No pricing or field documentation found for DataForSEO's apply-link equivalent field name/structure specifically.

## Do any SERP-API providers offer a dedicated "LinkedIn Jobs" or "Indeed" search API productized similarly (vs. generic Google search of those sites)?

### Takeaway
No provider found offers a purpose-built, dedicated "LinkedIn Jobs" or "Indeed Jobs" structured-data API akin to their Google Jobs product; SerpApi has an open, unfulfilled feature request for a LinkedIn Job Search API on its (now-migrated) public roadmap, and none of the researched providers document a first-class Indeed-jobs-specific endpoint — job data from those sites is only reachable indirectly through Google's own Jobs index (i.e., listings that happen to surface via `apply_options`) or through generic web-search/scraping of linkedin.com or indeed.com.

### Cited Findings
- SerpApi's community forum shows an open/legacy feature request: "Add LinkedIn Job Search API," noted as part of an "old roadmap" before migrating their public roadmap to GitHub — implying it was requested but, per available search results, not confirmed as shipped — [SerpApi Feature Requests: Add LinkedIn Job Search API](https://forum.serpapi.com/feature-requests/p/add-linkedin-job-search-api)
- "SerpApi's Google Jobs route touches LinkedIn not at all, making it a lower-risk legal option for accessing job data that overlaps with LinkedIn listings" (paraphrased from search-result synthesis, not a direct quote from SerpApi's own docs) — [search synthesis, underlying source unclear]
- Serper.dev's documented search types are: web, news, maps, places, images, videos, shopping, scholar, patents, and autocomplete — no "jobs" type exists — [Serper documentation via Sim Docs / navinspire.ai aggregation, cross-checked against serper.dev](https://serper.dev/)
- No dedicated Indeed-jobs-specific API product was found documented by SerpApi, SearchApi.io, DataForSEO, Serper.dev, or ValueSerp in this research pass.

### Inferences
- Given Serper.dev's fixed list of 10 search "types" with no jobs type, Serper.dev cannot be used for Google Jobs data at all today (it can only proxy generic Google web search of a query like `site:linkedin.com/jobs ...`, not a structured Jobs SERP) — this rules Serper.dev out as a Google-Jobs-API alternative entirely, though it could theoretically be used for generic-search scraping of LinkedIn/Indeed job listing pages (much lower-quality, unstructured data).
- Structured LinkedIn/Indeed job data access across the industry appears to route through: (a) Google Jobs aggregation (what SerpApi/DataForSEO/SearchApi.io productize), (b) direct site-specific scrapers (e.g., dedicated Apify actors for LinkedIn/Indeed, outside the SERP-API category), or (c) generic web-search APIs pointed at those domains — none of which is a first-party "LinkedIn Jobs API" or "Indeed Jobs API" product from any SERP-API vendor researched.

### Gaps
- Could not verify current (2026) status of SerpApi's LinkedIn Jobs feature request — whether it has since shipped, since the forum page referenced is described as an "old roadmap" with an unclear update date.
- Did not research non-SERP-API-category dedicated LinkedIn/Indeed scrapers (e.g., Apify's own LinkedIn/Indeed actors, Proxycurl, etc.) as they are out of scope for this SERP-API-provider-focused assignment.

## What are the real limitations — rate limits, caching/freshness (stale data risk), and geographic coverage (non-US, e.g. Canada, Egypt)?

### Takeaway
SerpApi enforces plan-proportional hourly throughput caps (20% of monthly volume per hour on sub-1M plans) and serves a 1-hour result cache for identical repeated queries (free, uncounted); DataForSEO's Standard queue can take up to 45 minutes (target) with a 2,000 calls/minute rate cap, while its Priority/Live queues are much faster; geographic coverage is broad — Google Jobs itself, and by extension every SERP-API wrapper, supports ~120+ countries via the `gl` parameter, explicitly confirmed to include both Canada (CA) and Egypt (EG).

### Cited Findings
- "For plans with under 1 million searches per month, the hourly throughput limit is 20% of your plan volume... the Developer Plan includes 5,000 searches per month, so subscribers can use up to 1,000 successful searches per hour. For plans with 1 million or more searches per month, the hourly throughput is 100,000 + 1% of your plan volume." — [search-result synthesis of SerpApi rate-limit documentation, underlying source not independently confirmed by direct fetch]
- "A cache is served only if the query and all parameters are exactly the same. Cache expires after 1h. Cached searches are free, and are not counted towards your searches per month." — [Google Jobs API - SerpApi](https://serpapi.com/google-jobs-api)
- DataForSEO Google Jobs SERP API: Standard method turnaround "up to 5 minutes (target 45 minutes, extended processing may occur)" at $0.0006/SERP (10 results); Priority queue turnaround "up to 1 minute average" at $0.0012/SERP — [DataForSEO Google Jobs SERP API pricing](https://dataforseo.com/pricing/serp/google-jobs-serp-api)
- DataForSEO overall SERP API rate limit: "Maximum 2000 POST/GET calls per minute (combined)... Up to 100 tasks per POST request. Custom limits available upon request." — [DataForSEO Google Jobs Overview](https://docs.dataforseo.com/v3/serp-google-jobs-overview/)
- A separate web-search snippet (not independently fetched from a primary DataForSEO page in this pass) states a Live mode exists at "$0.002 ($2.00 per 1,000) via Live mode" for Google Jobs — this is unconfirmed against DataForSEO's own pricing page content that was directly fetched, which only surfaced Standard and Priority pricing.
- Google Jobs `gl` (country) parameter supports 195 listed country/territory codes per a third-party provider's documented list, explicitly including EG (Egypt) and CA (Canada), alongside US, GB/UK, DE, FR, IN, ZA, NG, KE, SA, AE, and many others — [SearchApi.io: List of Google Jobs GL Countries](https://www.searchapi.io/docs/parameters/google-jobs/gl)
- SerpApi separately maintains its own "Google Jobs countries" reference page, referenced from its main Google Jobs API docs but whose specific country list content was not retrieved in this pass — [Google Jobs API - SerpApi](https://serpapi.com/google-jobs-api) (links to https://serpapi.com/google-jobs-countries)
- Google for Jobs itself (the underlying source all these APIs wrap) is reported to be "available in most major markets including North America, Latin America, Europe, Asia, Middle East, and Sub-Saharan Africa," and "represented in about 120 countries" per aggregated search-result synthesis, though no single authoritative Google source list was directly fetched — [search synthesis; underlying primary source (Google's own eligible-countries page) not directly fetched in this pass]

### Inferences
- Both SerpApi's 1-hour cache and the general "Google Jobs data is only as fresh as Google's own crawl/index" nature mean all these providers carry the same underlying staleness risk — they are wrappers around Google's SERP, not primary job-board crawlers, so a job listing removed/filled on the source site may still appear until Google's own index refreshes, independent of which SERP-API vendor is used.
- Country coverage is very unlikely to be a limiting factor for this evaluation — Egypt (Wuzzuf-adjacent search) and Canada are both confirmed-supported `gl` values across at least SearchApi.io's documented list, and since all these providers wrap the same underlying Google Jobs engine, coverage should be materially equivalent across SerpApi, DataForSEO, and SearchApi.io.
- DataForSEO's Standard-queue turnaround (~45 min target, could extend) makes it unsuitable for near-real-time use cases; Priority queue (~1 min, 2x price) or Live mode (immediate, higher price still) would be needed if the product requires fresh results, which materially changes the effective $/1,000-results comparison against Apify (the cheap $0.06–$0.12/1,000-results Standard-queue figures assume tolerance for up to ~45-minute-delayed data).

### Gaps
- Could not independently confirm DataForSEO's Live-mode Google Jobs price ($0.002/SERP mentioned only in a secondary aggregated search snippet, not verified via direct fetch of a DataForSEO primary page) — should be treated as unconfirmed pending a direct check of DataForSEO's Live-mode-specific pricing documentation.
- Could not independently verify the exact hourly-rate-limit formula for SerpApi via a direct primary-source fetch (only via aggregated web-search synthesis); recommend the report writer flag this as sourced from secondary material only.
- Did not retrieve the full content of SerpApi's own "Google Jobs countries" reference page (serpapi.com/google-jobs-countries) to cross-check against the SearchApi.io-sourced country list; the two providers likely mirror Google's own list but this was not directly confirmed for SerpApi specifically.

## Bonus: additional competitors surfaced during research (beyond ValueSerp/Zenserp)

### Takeaway
Beyond the originally named competitors, this research surfaced several other vendors offering a dedicated Google Jobs endpoint — SearchApi.io, SERPHouse, and ScraperAPI (async Google Jobs API) — while ValueSerp and Zenserp's Google-Jobs-specific support could not be confirmed with a working primary source in this pass, and Serper.dev was confirmed to have **no** Jobs search type at all.

### Cited Findings
- SearchApi.io publishes a dedicated "Google Jobs Scraper API" doc page with its own `apply_link`/`apply_links` fields and `gl` country parameter — [SearchApi.io Google Jobs docs](https://www.searchapi.io/docs/google-jobs)
- SERPHouse publishes a "Google Jobs API" doc page (title only surfaced via search result; content not fetched in this pass) — [SERPHouse Google Jobs API](https://docs.serphouse.com/google-apis/google-jobs-api)
- ScraperAPI publishes a "Google Jobs API (Async)" structured-data endpoint doc page (title only surfaced via search result; content not fetched in this pass) — [ScraperAPI Google Jobs API (Async) docs](https://docs.scraperapi.com/structured-data-endpoints/search-and-insights/google/google-jobs-api-async)
- A direct fetch attempt of ValueSerp's Google Jobs integration doc page (valueserp.com/docs/search-api/integrate/google-jobs) failed to return content in this research pass; a secondary aggregator (clura.ai) claims "ValueSERP offers 10,000 searches per month for $50" for Google Jobs, but this was not confirmed against ValueSerp's own primary documentation (now hosted at docs.trajectdata.com/valueserp/, per search results, since ValueSerp is part of Traject Data, acquired by ScraperAPI in April 2026) — [Clura: Google Jobs Has No Public API](https://clura.ai/blog/google-jobs-api); [ValueSERP Review: Low-Cost SERP API](https://serp.fast/tools/valueserp)
- No primary-source confirmation found that Zenserp offers a Google Jobs endpoint at all in this research pass.
- ValueSerp/Traject Data was "acquired by ScraperAPI in April 2026" per a secondary source — [ValueSERP Review: Low-Cost SERP API](https://serp.fast/tools/valueserp)

### Inferences
- The competitive landscape for Google-Jobs-specific SERP APIs is broader than the four originally named (SerpApi, Serper.dev, DataForSEO, ValueSerp, Zenserp) — SearchApi.io, SERPHouse, and ScraperAPI should also be considered if the report writer/decision-maker wants a fuller vendor shortlist, though pricing for these three was not obtained in this pass.
- Zenserp and Serper.dev both appear to lack a Google Jobs product entirely (Serper.dev confirmed via its documented search-type list; Zenserp via absence of any supporting source), meaning of the five originally named alternatives, only SerpApi, DataForSEO, and (unconfirmed) ValueSerp actually offer Google Jobs coverage.

### Gaps
- Pricing and field-structure detail for SearchApi.io's Google Jobs product (beyond the apply_link/apply_links field names) was not obtained — its own docs page did not disclose price-per-search or results-per-page in the content fetched.
- SERPHouse and ScraperAPI's Google Jobs offerings were only identified by page title via search results; no pricing, field structure, or coverage detail was fetched for either.
- ValueSerp and Zenserp's Google Jobs support/pricing remains unconfirmed by primary source; the ValueSerp doc-page fetch failed with no output, and no working Zenserp Jobs documentation was located at all.
