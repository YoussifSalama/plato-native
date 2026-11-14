# Following: companies and roles

How "Following" works in Plato today, what we are building next, and in what order.

A seeker can follow two things:

- **A company** ("PwC", "Orange", "Amazon"): every new opening there.
- **A role** ("Full Stack Developer", optionally a place or remote only): every new opening with that title, at any company.

New matches reach the seeker on their own schedule: in Plato (Home and the bell) and, if they turn it on, by email. The schedule is daily, every 3 days or weekly (Alert settings).

---

## 1. How it works today

Nothing runs per user. Jobs are collected into one shared index, and each new job is matched once against everyone's follows.

```
 Seekers' searches ──┐
                     ├──► shared job index (jobs) ──► matcher (every 15 min) ──► held matches ──► digest (on each seeker's schedule)
 Refresher (6 h) ────┘                                  job × every follow            (alert_matches)      in-app + email
   free sources only                                                                                       closed jobs dropped
```

| Part | Where | What it does | How often |
|---|---|---|---|
| Shared index | `jobs` collection | Every job any seeker's search found, from every source. Deduplicated per posting. | as searches run |
| Refresher | `insights/backfill.service.ts` | Pulls new jobs for what people follow, from free sources only: open remote feeds, Workable's public search, and the Greenhouse/Lever/Ashby boards of followed companies (up to 40). No paid scraping. | every 6 h |
| Matcher | `insights/alert-matcher.service.ts` | Walks jobs as they enter the index and records a match for every follow they fit. A new follow starts with the last 3 days, so the first digest isn't empty. | every 15 min |
| Rules | `insights/alert-rules.ts` | Company: same company key (normalised name). Role: same title rule as the search ("Frontend Engineer" also finds "Front-end Developer"), plus the place or remote-only, when set. | — |
| Digest | `insights/digest.service.ts` | One digest per seeker on their schedule. Each job is re-checked just before it goes out; closed or stale ones are dropped. | checks hourly |
| Freshness | `discovery/job-freshness.service.ts` | Re-checks open jobs and marks closed ones. | every 6 h |

So the second idea ("results from searches feed the follows") already works. When a search finds a PwC job, everyone following PwC gets it in their next digest. When anyone searches "Full Stack Developer", everyone following that role gets the new jobs.

**What is missing:**

1. **A curated list of company sources.** Today Plato only knows a company's job board if a past search happened to find one of its jobs on Greenhouse, Lever or Ashby. Companies that post on their own careers site, Workday, SmartRecruiters, Bayt or LinkedIn only are found only when someone's search finds them.
2. **A page per followed company and per followed role.** Today "See roles" opens the Jobs page with a filter.
3. **Better role matching.** A followed role matches its title only. It doesn't use the title expansion the search uses (Full Stack Developer → Backend, Frontend, Node.js…), and it doesn't check whether the seeker can apply from where they live.

---

## 2. Target design

### 2.1 Company sources: the "to follow" catalogue

A table we curate: the companies people are likely to follow, and where each one posts its jobs.

**First seed:** a sheet of the top 200–300 employers in Egypt and the Arab world, imported once, then kept up to date.

| Column | Example | Notes |
|---|---|---|
| `name` | PwC Egypt | shown to seekers |
| `aliases` | PwC; PricewaterhouseCoopers; PwC Middle East | how postings may name it; all map to one company key |
| `country` | EG | main market; several allowed |
| `website` | pwc.com | for the logo |
| `source_type` | greenhouse / lever / ashby / workable / smartrecruiters / workday / bamboohr / recruitee / teamtailor / personio / bayt / wuzzuf / linkedin / careers_page | one row per source; a company can have several |
| `source_ref` | board slug, or the careers page URL | e.g. `pwc` for a Greenhouse board, or `https://www.pwc.com/m1/en/careers.html` |

New table `company_sources` (Mongo), one document per company:

```
company_key        unique, normalizeCompany(name).key
name, aliases[], country[], website
sources[]          { type, ref, status: active|broken|unverified, last_ok_at, last_error }
followers          count of active COMPANY follows (kept up to date)
tier               hot | warm | cold   (how often it is crawled, see 2.2)
last_crawled_at, last_new_job_at
added_by           sheet | auto | seeker
```

**How the catalogue grows after the sheet:**

- **Automatically:** when a search stores a job from a known job-board system (Greenhouse, Lever, Ashby, Workable…), its board is attached to that company's entry with status `unverified`. The next crawl confirms it.
- **When a seeker follows a company that isn't in the catalogue:** it is added with `added_by: seeker` and no source yet. Matching by name from the shared index still works meanwhile. It is listed for us to find its source (an internal list; later an AI step that searches for the careers page).

### 2.2 The company crawler (one worker per company, never per user)

A background job that walks the catalogue, not the users.

```
 every 15 min: pick the companies that are due
   └─ for each company: for each source: fetch open jobs (fetcher per source type)
        └─ normalise → same gate as searches → upsert into the shared index
              └─ the existing matcher fans the new jobs out to everyone following that company
                 (and to role follows the jobs happen to fit)
```

- **Due = tier.** `hot` (10+ followers, or a new job in the last 7 days): every 6 h. `warm` (1–9 followers): daily. `cold` (in the catalogue, no followers): weekly. So 10 people following Deloitte cost the same as one.
- **Fetchers per source type, cheapest first:**
  - **Free public job-board APIs:** Greenhouse, Lever, Ashby and Workable already exist in `public-boards.adapter.ts`. SmartRecruiters, BambooHR, Recruitee, Teamtailor and Personio use the same pattern. These are free and give exact data.
  - **Workday:** a public JSON endpoint per tenant. Free, but each tenant needs its own URL in the sheet.
  - **Bayt, Wuzzuf, LinkedIn company pages:** paid, through the existing Apify actors. One run per company per due time, shared by all its followers, within a daily budget.
  - **Custom careers pages (the long tail):** a generic page reader, either an Apify website crawler or Claude's web fetch tool. This is the costliest and least reliable option, so it is used weekly and only for companies with followers.
- **Budget:** a daily cap on paid calls (Apify and AI). When the cap is reached, paid sources wait for the next day; free sources keep running.
- **Health:** a source that fails 3 times in a row is marked `broken` and listed for us to fix. Its followers still get matches from the shared index.

### 2.3 Role follows

A followed role is served by the shared index: every seeker's searches, plus the refresher. With 10 Full Stack seekers searching, the 11th, who only follows "Full Stack Developer", is fed by their searches. This is what you described, and it already works.

**What changes:**

- **The same title expansion as the search.** When a role is followed, the title planner stores the titles that seeker's background can land (Full Stack Developer → Backend Developer, Node.js Developer…). The seeker sees them and can remove any. The matcher uses that list.
- **The same rules as the search.** Remote-only, place, "can apply from where I live" and level use the search gate (`fitsSearch`), so a followed role never brings jobs the seeker's own search would have dropped.
- **Demand-driven refresh.** The refresher already pulls free sources for followed titles. Add: when a popular followed role (5+ followers) got no new job in 3 days, it gets one paid LinkedIn/Indeed run shared by all of them, within the daily budget.

### 2.4 Where the engine runs

Today the matcher, refresher, digest and freshness jobs run inside the API process (`setInterval`). That is fine with one API instance.

**Plan:**

- Move the background jobs into a **worker process**: the same codebase and Docker image, started with `WORKER=1`, a second container on the VPS. The API stops running the loops (`INSIGHTS_JOBS=off` already exists). Background work then never slows down the site, and the API can scale on its own.
- Each loop takes a **lease** in Mongo before it runs (a `job_locks` document with an expiry), so two workers never crawl the same company twice.
- No queue system (BullMQ/Redis) for now. Mongo leases and the existing cursors are enough at this size. Add a queue when the crawler handles thousands of companies.

---

## 3. Pages

### 3.1 Company page: `/following/companies/[key]`

Opened from the company card ("See roles") and from any company name in a followed-company list.

- **Header:** logo, name, country, "N open · M for you", bell (alerts on/off), Unfollow.
- **Jobs:** every open job at this company in the shared index, not only the ones a digest sent. Best match first, the same rows as the search results (match %, eligibility, Apply, Save). Filters: Remote, Location, Posted.
- **Side note:** where Plato checks this company ("its careers page, checked every 6 hours") and when it last found a new job.
- **API:** `GET /job-seeker/insights/companies/:key` (header + sources) and `GET /job-seeker/insights/companies/:key/jobs?skip&take&…` (open jobs at that company, ranked for the seeker, using the same ranking and gate as the search).

### 3.2 Role page: `/following/roles/[alertId]`

Opened from a row in "Roles you follow".

- **Header:** title, place / remote only, "N new this week", switch (on/paused), edit.
- **Also covers:** the expanded titles from 2.3, each removable.
- **Jobs:** every open job in the shared index that fits this follow, newest first, the same rows as the search results. The ones already sent in a digest are marked "sent on {date}".
- **API:** `GET /job-seeker/insights/alerts/:id` and `GET /job-seeker/insights/alerts/:id/jobs?skip&take`.

The Following page keeps its layout. "See roles" and each role row link to these pages instead of filtering the Jobs page.

---

## 4. Phases

Each phase can be deployed on its own and ends with a check.

| # | What | Done when |
|---|---|---|
| 1 | **Company and role pages** (3.1, 3.2) and their APIs, on today's data | Clicking a company card or a role row opens its page with the right jobs. Specs for both endpoints. |
| 2 | **Role follows use the search's titles and rules** (2.3, first two points) | A followed "Full Stack Developer" also matches "Backend Developer" when the CV supports it, and never matches a job the seeker's search would drop. Matcher specs. |
| 3 | **Catalogue + sheet import** (2.1) | The 200–300 company sheet imports. The auto-attach of job boards from searches works. An admin list shows companies without a source. |
| 4 | **Company crawler, free sources** (2.2: Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Recruitee, Teamtailor, Personio, Workday) with tiers and health | Followed catalogue companies get new jobs without anyone searching. A broken source is flagged. |
| 5 | **Paid and long-tail sources** (Bayt, Wuzzuf and LinkedIn company runs; careers pages via a page reader) under a daily budget; demand-driven role refresh | Companies with no public job board still get jobs. Paid spend stays under the cap. |
| 6 | **Worker process + leases** (2.4) | Background jobs run in their own container; the API has none. Two workers never double-crawl. |

---

## 5. Decisions needed

1. **The sheet:** who builds the first 200–300 companies, and do we include Gulf employers from the start or Egypt first?
2. **Daily budget for paid sources** (Apify + AI): how much per day for company crawling and role refresh?
3. **Careers pages:** Apify website crawler or Claude web fetch for companies with no job board? Claude reads a page better; Apify is cheaper per page. Suggested: try both on 20 companies and compare cost and accuracy.
4. **Follow limits per plan** (`ALERT_LIMITS` in `alert-rules.ts`): keep the current numbers?
