# Official/Partner Job-Listing Aggregator APIs as Apify Scraper Alternatives

Research date: 2026-09-30. Baseline for comparison: Apify pay-per-result scrapers at $0.0007–$0.005 per job result.

## Adzuna API — free/paid, rate limits, coverage, is it independent or an aggregator?

### Takeaway
Adzuna is free for development/low-volume use with modest rate limits, but commercial-scale use requires a custom (non-public) licence negotiated directly with Adzuna. It is itself a web-crawling aggregator of "thousands of sources" (company career pages, staffing agencies, niche boards) rather than a reseller of Indeed/LinkedIn data — its overlap with the 12 target platforms is likely partial and unconfirmed for the big platforms specifically.

### Cited Findings
- Free tier: default limits of 25 calls/minute, 250/day, 1,000/week, 2,500/month — described as of September 2026 — enough for development/small apps; higher volumes "available on request." — [Adzuna via aggregator summary](https://publicapis.io/adzuna-api)
- Commercial, government, and academic use gets a 14-day trial and then requires a licence agreement arranged directly with Adzuna (no public pricing page). — [Adzuna developer overview](https://developer.adzuna.com/overview)
- Registration is self-serve: sign up for an `app_id` and `app_key` immediately, no approval wait for the free/dev tier. — [Adzuna Developer Signup](https://developer.adzuna.com/signup)
- Country coverage: Adzuna serves roughly 16–20+ countries, including Australia, Austria, Belgium, Brazil, Canada, France, Germany, India, Italy, Mexico, Netherlands, New Zealand, Poland, Singapore, South Africa, Spain, Switzerland, UK, and US. — [Adzuna MCP server README](https://github.com/folathecoder/adzuna-job-search-mcp)
- Adzuna aggregates job ads from across the web ("thousands of sources") into its own structured database — it is a search-engine/aggregator model, not a thin wrapper reselling Indeed or LinkedIn's own feeds. — [WebSearch synthesis citing Adzuna docs](https://developer.adzuna.com/)
- Whether Adzuna specifically ingests Indeed or LinkedIn listings is not confirmed by official documentation; one comparison notes Adzuna is described as "transactional" versus LinkedIn's "relational" model, implying they are largely distinct, separately-sourced platforms rather than Adzuna re-publishing LinkedIn/Indeed content. — [Join.com Adzuna review](https://join.com/en/job-boards/adzuna)

### Inferences
- Adzuna is best treated as a free/cheap supplementary source of its own aggregated listings (likely strong on company-career-page and niche-board jobs), not a substitute for scraping the specific big platforms (LinkedIn, Indeed, Glassdoor, etc.) directly — its per-platform coverage of the 12 target platforms could not be confirmed and should be spot-checked empirically before relying on it.
- At the free tier's volume (2,500/month), Adzuna is effectively free for the token volume most Apify baselines would consider small; it only becomes a negotiated-price product at meaningful commercial scale.

### Gaps
- No public pricing was found for the commercial/licensed tier — Adzuna does not publish per-call or per-month rates beyond the free tier; would require direct sales contact to get a 2026 quote.
- Could not confirm definitively whether Adzuna's index includes listings originating from Indeed, LinkedIn, Glassdoor, ZipRecruiter, Dice, Talent.com, or any of the other 12 target platforms specifically — Adzuna does not publish a source/platform breakdown.

---

## Jooble API — free/paid, approval process, coverage

### Takeaway
Jooble issues API keys after a short registration form (not a long enterprise approval), but the free tier is capped at an extremely low **500 requests per key for the lifetime of the key** (not monthly) — a volume too small for production job-scraping use — and no public paid tier/pricing was found.

### Cited Findings
- API keys are requested via a short form at `jooble.org/api/about` (or the country-specific subdomain, e.g. `uk.jooble.org/api/about`, `de.jooble.org/api/about`); each country's domain issues its own key scoped to that country's job data only. — [Jooble REST API](https://jooble.org/api/about); [Jooble Help Center — connecting to REST API](https://help.jooble.org/en/support/solutions/articles/60000922689-how-to-connect-to-the-jooble-rest-api-after-receiving-the-key)
- The free plan carries a **total lifetime limit of 500 requests per key** — confirmed as an absolute quota, not a recurring monthly allowance. — [Jooble Help Center — REST API Documentation](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation)
- Response fields include job id, title, location, description snippet, salary range, employment type, company name, a `source` field, direct link, and update timestamp; one example result shows `"source": "jooble"`, but the documentation does not clearly disclose whether/how much content is aggregated from third-party boards versus Jooble's own index. — [Jooble Help Center — REST API Documentation](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation)
- No public paid-tier pricing was found in official documentation; follow-up searches for paid plans returned only the same free/lifetime-500 figure, with third-party sources speculating "rate limits vary depending on your usage tier" without confirming numbers or cost.

### Inferences
- Jooble's free API is realistically only usable for a one-time proof-of-concept or very small pilot (500 calls total ever) — not viable as an ongoing production data source without contacting Jooble for a custom/paid arrangement, which does not appear to be self-serve or publicly documented.
- The stated ease of "approval" (short form, no lengthy review) is real for the free tier, but the free tier's usefulness is essentially nil at production scale — the "free" framing is misleading for a company evaluating it against Apify's per-result pricing.

### Gaps
- No confirmed source for whether/how to obtain a paid Jooble plan, its pricing, or its request limits — this would require direct outreach to Jooble.
- No confirmed breakdown of which of the 12 target platforms (if any) Jooble's index overlaps with — not documented publicly.

---

## Careerjet API — partner/affiliate program terms, cost, coverage

### Takeaway
Careerjet's Search API is free to access (free partner/affiliate account, free API key) but is licensed as a **publisher/affiliate tool** — intended for displaying Careerjet's job search results on a partner's website in exchange for click-based affiliate revenue-share, not as a general-purpose data-extraction/analytics API — with a rate limit around 1,000 requests/hour.

### Cited Findings
- To use the API you must open a free Careerjet partner/affiliate account at careerjet.com/partners and register the website that will display results; an `affid` (affiliate ID) tied to that account, plus `user_ip`, `user_agent`, and the page URL, must be passed with each request. — [Careerjet API Python client README](https://github.com/careerjet/careerjet-api-client-python/blob/master/README.md)
- The partner account itself is free to register; the affiliate program structure is Earn-Per-Click plus a 2-tier referral commission (10% of sub-affiliates' earnings), i.e., Careerjet pays partners for driving clicks rather than charging for API access. — [Digital Point forum thread on Careerjet affiliate program](https://forums.digitalpoint.com/threads/careerjet-affiliate-program-anyone-have-experience-with-them.2154536/)
- API rate limit is stated as 1,000 requests per hour. — [Careerjet API aggregator summary](https://publicapi.dev/careerjet-api)
- Geographic coverage spans 60+ locales/countries across Europe, the Americas, Asia-Pacific, and the Middle East (UK, Germany, France, Spain, Netherlands, Poland, Russia, US, Canada, Mexico, Brazil, Australia, India, Japan, South Korea, Singapore, China, UAE, Saudi Arabia, Qatar, Kuwait, Oman, and more), each backed by a region-specific Careerjet job board. — [Careerjet API Python client README](https://github.com/careerjet/careerjet-api-client-python/blob/master/README.md)
- Careerjet's own program is explicitly framed by third-party commentary as "built for publishers, not pipelines" — i.e., designed for websites embedding a search box/results widget, not for bulk data extraction. — [JobsPipe blog on Careerjet API](https://jobspipe.dev/blog/careerjet-api) (note: source is a competing commercial jobs-API vendor; treat framing as commercially motivated but the underlying "publisher program" fact is corroborated by the official README's affiliate-ID requirement.)

### Inferences
- Careerjet is realistically usable at no monetary cost, but the terms are structured around driving affiliate click-throughs back to Careerjet, so using it purely to harvest structured job data (rather than to display a Careerjet-branded search widget) may sit outside the program's intended use and could be subject to Careerjet's discretion/enforcement.
- Careerjet itself is a job aggregator with independent regional job boards; overlap with the 12 target platforms (LinkedIn, Indeed, etc.) is not documented and would need empirical verification.

### Gaps
- No official published Terms of Service excerpt was retrieved (only third-party summaries and the GitHub client README) — a direct read of Careerjet's partner terms page would be needed to confirm whether non-display/bulk data use is permitted.
- No confirmation of which, if any, of the 12 target platforms overlap with Careerjet's own listings.

---

## JSearch API on RapidAPI — pricing tiers, rate limits, is it a Google Jobs wrapper?

### Takeaway
JSearch is confirmed by multiple independent sources to be a wrapper that surfaces Google for Jobs results (which itself aggregates Indeed, LinkedIn, ZipRecruiter, Glassdoor, and other boards) rather than an independently-sourced index — functionally similar in coverage to SerpApi's Google Jobs product, but sold through RapidAPI's marketplace with roughly a 30% platform markup over the underlying provider's own pricing.

### Cited Findings
- Pricing tiers (RapidAPI marketplace): **Basic** $0/month for 200 requests/month (free, no credit card); **Pro** $25/month for 10,000 requests; **Ultra** $75/month for 50,000 requests (marked "recommended"); **Mega** $150/month for 200,000 requests. — [WebSearch result citing RapidAPI JSearch pricing page](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch/pricing)
- All plans, including free, are rate-limited to 1,000 requests/hour. — [OpenWeb Ninja — JSearch API page](https://www.openwebninja.com/api/jsearch)
- For custom/higher volume needs, RapidAPI directs users to contact the underlying provider (OpenWeb Ninja) directly at support@openwebninja.com. — [OpenWeb Ninja — JSearch API page](https://www.openwebninja.com/api/jsearch)
- JSearch aggregates roughly five upstream sources (LinkedIn, Indeed, ZipRecruiter, Glassdoor, Bayt) into one unified response shape, and is explicitly described as reading from **Google for Jobs** to source this real-time data, rather than querying each platform independently. — [OpenWeb Ninja — JSearch API page](https://www.openwebninja.com/api/jsearch); [JobsPipe — JSearch API analysis](https://jobspipe.dev/blog/jsearch-api-direct) (competing vendor, but corroborated by the primary OpenWeb Ninja listing)
- Response fields include `job_title`, `employer_name`, `job_country`, `job_description`, `job_apply_link`, and a `job_publisher` field indicating the underlying source platform. — [WebSearch synthesis of JSearch documentation](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch)
- Third-party comparison explicitly frames JSearch as "RapidAPI's most-installed jobs endpoint — but it's a wrapper with a ~30% markup and a 200-request free cap... a third-party scraper that wraps Indeed, ZipRecruiter, Glassdoor, LinkedIn... largely by reading Google for Jobs results," and notes it has "no webhooks, no dedup" and is "great for a prototype" but limited beyond that. — [JobsPipe — best jobs APIs 2026 comparison](https://jobspipe.dev/blog/best-jobs-api-2026) (competing commercial vendor's blog — directionally useful but should be weighted as marketing-adjacent commentary, not neutral)

### Inferences
- At the $25/mo Pro tier (10,000 requests), JSearch works out to roughly $0.0025/request before accounting for how many job results each request returns (likely multiple results per call, which would lower true per-job cost) — this is in a similar range to Apify's stated $0.0007–$0.005 per result baseline, so it may not represent a large cost advantage, though it removes scraper-maintenance overhead.
- Since JSearch is confirmed to be a Google-for-Jobs-based wrapper, its coverage should be treated as equivalent to (not independent of / not more authoritative than) SerpApi's Google Jobs product — i.e., it inherits Google for Jobs' coverage gaps and freshness/dedup issues rather than being a first-party feed from LinkedIn/Indeed/etc.

### Gaps
- Could not verify the exact number of job results returned per API request/credit (needed to compute true per-job cost comparable to Apify's per-result pricing) — would require a hands-on trial account.
- No confirmation of official rate-limit-versus-price relationship at the Mega tier or above, or whether enterprise custom pricing exists beyond $150/month.

---

## USAJobs API — is it a relevant, free supplement (US federal jobs only)?

### Takeaway
USAJobs offers a fully free, self-serve, official government API with no paid tier — relevant only as a narrow supplement covering exclusively US federal government job postings, which is unlikely to overlap meaningfully with the 12 target commercial platforms.

### Cited Findings
- The API is free to use with no paid tier; registration for an API key happens directly at developer.usajobs.gov, and it is a public service operated by the U.S. Office of Personnel Management (OPM). — [WebSearch synthesis of USAJOBS developer site](https://developer.usajobs.gov/)
- Its explicit stated purpose is to broaden the reach of USAJobs listings to commercial job boards, mobile apps, and social-media outlets — i.e., USAJobs actively wants third parties to redistribute its listings, unlike most platforms in this research. — [WebSearch synthesis](https://developer.usajobs.gov/)
- The REST API (at data.usajobs.gov) exposes a `GET /api/search` endpoint over every openly-advertised federal job announcement, plus reference/taxonomy endpoints (agency subelements, occupational series, pay plans, hiring paths, security clearances) and historic/archived-announcement endpoints. — [WebSearch synthesis of USAJOBS schema docs](https://developer.usajobs.gov/schemas/)
- Authentication requires an API key plus a contact User-Agent string on every request (self-serve, no lengthy approval process implied). — [WebSearch synthesis](https://developer.usajobs.gov/)

### Inferences
- USAJobs is a genuinely zero-cost, low-friction source, but its coverage is scoped strictly to US federal government positions — it does not overlap with any of the 12 named commercial platforms (LinkedIn, Indeed, Glassdoor, ZipRecruiter, Dice, Google Jobs, Talent.com, Jobillico, JobBank Canada, BuiltIn, Handshake, Wuzzuf). It would only be useful if the product's scope includes US federal jobs as a distinct category, not as a substitute for scraping any of the 12 platforms.

### Gaps
- No rate-limit figures were retrieved (requests/minute or /day) — would need a direct read of the developer.usajobs.gov terms of service page for exact throttling numbers.

---

## Indeed Publisher API / XML feed — current status, and any official data-partnership path

### Takeaway
Indeed's self-serve Publisher API/XML feed is confirmed **shut down since 2023** with no self-serve replacement; the only paths to Indeed job data today are (a) a partner-gated GraphQL/employer-side API ecosystem requiring a signed Developer Agreement and Indeed's discretionary approval, or (b) a separate, NDA-gated, sales-led enterprise data-partnership program reportedly carrying six-figure minimum commitments — neither is accessible to a small company without a significant sales process and cost.

### Cited Findings
- "Indeed shut down the Publisher API in 2023... in favor of their publisher.indeed.com hosted-search widget (which is iframe-only, not data-accessible) and a separate enterprise data partnership program (NDA-gated, sales-led, six-figure minimums)." Existing publisher keys stopped returning data and no self-serve replacement was offered. — [JobsPipe — "What happened to the Indeed Publisher API"](https://jobspipe.dev/blog/indeed-publisher-api) (competing vendor's blog; the 2023 shutdown date and iframe-only replacement are stated as fact and are consistent with the independently-sourced Vorp Labs summary below)
- Independently: "Indeed APIs: partner-only access for employers, agencies, and ATS platforms, and no documented consumer job-search API." — [Vorp Labs — Indeed API overview](https://vorplabs.com/agent-tools/indeed-api)
- Indeed's currently active, officially documented APIs (per Indeed's own partner docs site as of September 2026) are employer/partner-side tools: Retrieve Candidates API, Job Update API, Job Sync API (noted as "now available to direct employers" as of July 31, 2026), Indeed Apply, and a GraphQL API for job posting management — these are for employers/ATS platforms pushing job postings and managing applicants, not for third parties pulling/reading Indeed's listing inventory. — [Indeed Partner Docs — release notes](https://docs.indeed.com/release-notes)
- All partner integrations require "a signed Developer Agreement, an API key granted at Indeed's sole discretion, and written verification and approval of each integration before launch." — [WebSearch synthesis of Indeed partner API access requirements](https://docs.indeed.com/)
- The enterprise data-partnership program is described as "NDA-gated, sales-led, priced per agreement with reported six-figure minimums... for large data buyers, not for the affiliates and developers the Publisher API served." — [JobsPipe — Indeed API guide](https://jobspipe.dev/blog/indeed-api-guide) (competing vendor's blog; six-figure-minimum figure is unconfirmed by a primary Indeed source and should be treated as a reported/secondhand claim)

### Inferences
- There is no realistic, affordable, self-serve official path to bulk Indeed job-listing data in 2026. Any approach to Indeed inventory either requires becoming an approved ATS/employer partner (irrelevant for a job-listing consumer use case) or negotiating a large, NDA-bound enterprise data deal — Apify-style scraping (with its legal/ToS risk) remains the only low-cost option for Indeed specifically, unless the six-figure enterprise deal is in budget.

### Gaps
- The exact six-figure minimum for Indeed's enterprise data partnership is a secondhand/reported figure (from a competing vendor's blog), not confirmed by a primary Indeed source — no official pricing page exists to verify.
- Could not confirm whether Indeed's enterprise data-partnership program is even open to new sign-ups in 2026, or whether it is fully closed to new small/medium entrants.

---

## LinkedIn Talent/Jobs API — real-world approval process, accessibility to a small company

### Takeaway
LinkedIn's Recruiter/Talent Solutions API access is confirmed to be gatekept to large enterprise partners: it requires an existing incorporated-company relationship, a lengthy (3–6 month) partner-application review with a reported approval rate under 10%, and a minimum annual contract commonly cited around $50,000–$100,000 — realistically inaccessible to a small company.

### Cited Findings
- "LinkedIn's Recruiter API isn't available to individual developers or small companies—it requires an existing enterprise relationship with LinkedIn Talent Solutions... LinkedIn Partners APIs applications are only available for incorporated companies and not individual developers." — [Getphyllo — LinkedIn API Ultimate Guide 2026](https://www.getphyllo.com/post/linkedin-api-ultimate-guide-on-linkedin-api-integration)
- "The approval process is rigorous, typically taking 3–6 months, with an approval rate of less than 10%... 4-8 weeks for partner application review and 2-4 weeks for technical integration approval." — [WebSearch synthesis, citing multiple 2026 LinkedIn API guides]
- Application path: submit a "Partner Program Application Form" / "Talent Solutions Partnership Request Form for Talent API," which requires meeting eligibility criteria and signing an API agreement with data-use restrictions; applicants who are not already a LinkedIn Talent Solutions Partner must first complete the "LinkedIn Talent Solutions Partner Request Form." — [Microsoft Learn — Getting Access to LinkedIn APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- "The Recruiter API requires a minimum annual contract typically starting around $50,000-$100,000 for access credentials." — [WebSearch synthesis of 2026 LinkedIn API guides]

### Inferences
- LinkedIn's official API path should be considered effectively closed to a small company both on cost grounds (five/six-figure annual minimum) and on approval-odds grounds (sub-10% approval, months-long review requiring incorporated-company status and an existing Talent Solutions relationship). Scraping (via Apify or otherwise) or third-party wrapper APIs (like JSearch, which surfaces LinkedIn postings via Google for Jobs) remain the only practically accessible paths to LinkedIn job data for a company at this stage.

### Gaps
- The $50K–$100K minimum-contract figure and the <10% approval-rate figure both come from secondary developer-guide summaries (Getphyllo, Microsoft Learn ecosystem posts), not a primary LinkedIn pricing page — LinkedIn does not publish these terms publicly, so exact current figures could not be verified from a primary source.

---

## Google Talent Solution / Google for Jobs structured data — official listing path, and any API to query results

### Takeaway
Google offers **no public/official API to query or retrieve Google for Jobs search results** (Google's earlier "Cloud Talent Solution"/Jobs API for querying results was shut down in May 2021); the only officially-sanctioned mechanism today is getting your own postings *listed* in Google for Jobs via JobPosting structured data (schema.org JSON-LD) plus either an XML sitemap or the general-purpose Indexing API to prompt faster crawling — this is a one-way "get indexed" mechanism, not a way to pull aggregated results the way SerpApi's Google Jobs scraper does.

### Cited Findings
- "In May 2021, Google officially shut down the Google Jobs API, a service that previously allowed businesses and job platforms to integrate job listings directly into their websites." — [WebSearch synthesis, corroborated by Scrapfly's Google Jobs API guide](https://scrapfly.io/blog/posts/guide-to-google-jobs-api-and-alternatives)
- Confirmed directly from Google's own documentation: Google does not offer a public API to query/retrieve Google for Jobs search results programmatically — the official docs make no mention of such a query API. — [Google Search Central — JobPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting)
- Google does provide the general-purpose **Indexing API** as the recommended mechanism for job posting URLs specifically: "For job posting URLs, we recommend using the Indexing API instead of sitemaps because the Indexing API prompts Googlebot to crawl your page sooner." This is for notifying Google of new/updated/removed job pages, not for querying results. — [Google Search Central — JobPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting)
- To appear in Google for Jobs, a page must include JobPosting structured data (JSON-LD) with required properties (`datePosted`, `description`, `hiringOrganization`, `jobLocation`, `title`), be crawlable, include a complete job description and application method, use canonical URLs, avoid expired/fake/misleading postings, and comply with Google's spam policies. — [Google Search Central — JobPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting)
- Because there is no official query API, third-party tools such as SerpApi's "Google Jobs API" are themselves unofficial scrapers of Google's search results pages (not backed by a Google-sanctioned API), which is the same category of risk/cost profile as Apify — SerpApi is noted elsewhere in this research as "the most expensive [scraping option] at every tier, starting at $25/1K." — [WebSearch synthesis citing SerpApi Google Jobs pricing](https://serpapi.com/google-jobs-listing-api)

### Inferences
- Google for Jobs cannot be replaced with an "official API" for the purpose of *consuming* aggregated Google Jobs results — it can only be used as a *distribution* channel (getting the company's own postings indexed via structured data + Indexing API), which is a different use case from pulling competitor/market listings. For consuming Google for Jobs results, both SerpApi and JSearch remain unofficial-data-source wrappers, not sanctioned APIs, and neither should be described as "official" despite JSearch's polished RapidAPI packaging.

### Gaps
- None significant for this question — Google's own structured-data documentation directly and unambiguously confirms no official query API exists, which is a well-corroborated, primary-sourced finding.

---

## Other 12-platform coverage notes (Glassdoor, ZipRecruiter, Dice, Talent.com, Jobillico, JobBank Canada, BuiltIn, Handshake, Wuzzuf)

### Takeaway
Outside the 8 assigned APIs, a couple of the 12 target platforms do run their own official, partner-gated data/posting APIs (ZipRecruiter, Glassdoor) with access restricted to signed partnership agreements — no evidence was found of open/self-serve official data APIs for Dice, Talent.com, Jobillico, JobBank Canada, BuiltIn, Handshake, or Wuzzuf within this research pass.

### Cited Findings
- ZipRecruiter runs an official "Jobs API" under its Partner Platform, but it is scoped to ATS vendors, HRIS platforms, and staffing firms that push/manage job listings and pull applicants — it requires a signed partnership agreement to obtain credentials, and is not a general job-search/read API for third-party consumers. — [ZipRecruiter Partner Platform — Jobs API docs](https://www.ziprecruiter.com/partner/documentation/job-api/)
- Glassdoor has Jobs APIs that are "not provided publicly, but are available to their API partners" — interested parties must contact Glassdoor to become an API partner; no self-serve signup exists. — [Glassdoor Developer — Jobs API Actions page](https://www.glassdoor.com/developer/jobsApiActions.htm)
- No official API or partner-program information was found in this research pass for Dice, Talent.com, Jobillico, JobBank Canada, BuiltIn, Handshake, or Wuzzuf — searches returned no primary-source results for these platforms' official data APIs.

### Inferences
- Among the 12 target platforms, only LinkedIn, Indeed, ZipRecruiter, and Glassdoor were confirmed (in this research) to run any kind of official/partner API program at all, and all four are gatekept behind partnership agreements rather than being self-serve. Google for Jobs is indexable (one-way) but not queryable via an official API. The remaining platforms (Dice, Talent.com, Jobillico, JobBank Canada, BuiltIn, Handshake, Wuzzuf) showed no evidence of an official data API in this pass — this could mean none exists, or it could mean the research simply didn't surface it; further platform-by-platform research would be needed to confirm either way, since these platforms were outside this assignment's explicit 8-API scope.

### Gaps
- This research pass was scoped to the 8 named APIs (Adzuna, Jooble, Careerjet, JSearch, USAJobs, Indeed Publisher, LinkedIn Talent, Google for Jobs) per the assignment; Dice, Talent.com, Jobillico, JobBank Canada, BuiltIn, Handshake, and Wuzzuf were not independently deep-researched for their own official APIs — flagging this as an explicit gap for the report writer, since the constraints asked for coverage mapping across all 12 platforms.
