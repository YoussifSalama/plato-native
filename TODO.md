# Plato Hires — Developer To-Do List

**Goal:** an AI-native career platform: discover professional jobs worldwide,
apply automatically with tailored resumes, prepare for interviews, close skill
gaps, and run everything through one AI agent.

Order below is the recommended build order. `[x]` = already in the repo,
`[ ]` = to do, `[~]` = cancelled. "Today" notes say what exists so nobody rebuilds it.
Costs and plan numbers: [MEASURED_COSTS.md](plato-native-be/MEASURED_COSTS.md),
[COST_AND_PRICING.md](plato-native-be/COST_AND_PRICING.md).

---

## 1. AI-native experience, navigation and shortcuts

**Today:** the job-search chat (orchestrator agent) searches, lists and explains
jobs and answers "where am I". It cannot move the app. Career chat is a
separate agent with its own thread. Replies now stream live.

- [x] Streaming replies in Career chat
- [x] Navigation tools for the agent (`navigate(page)`, `open_job(n)`, `apply_filter`, `remove_filter`) that emit UI events the frontend executes. Done in the Jobs-search assistant only; Career chat and the other pages do not have them yet
- [x] One assistant reachable from every page (global panel or shortcut), not only Jobs and Career. Docked panel + Ctrl/Cmd+K on Home, Applications, Messages, Notifications, Profile; it continues your latest search conversation
- [x] Shared conversation memory across pages: preferences injected into both assistants every turn, and each sees the other's latest chat (last 6 messages, latest search, resumes built). Two threads share memory by injection; they are not merged into one thread
- [x] Follow-up understanding ("only ones that accept Egypt", "open the first job") using the current result list as context. The assistant gets the rows on screen and the active filters each message; new `acceptsCountry` filter reads postings' stated applicant regions
- [x] Confirmation step before sensitive actions: applying (buttons and assistant) asks first; the assistant can only propose, never submit; "don't ask again" is remembered per browser for the buttons. No delete-data action exists in the app yet, so none is covered
- [x] Quick actions and keyboard shortcuts (command palette): Ctrl/Cmd+K to jump, start a search or interview practice, or ask Plato AI
- [x] Performance pass (partial): routes prefetched when the palette opens, instant loading skeleton, flow-diagram library lazy-loaded (187 KB chunk), Web Vitals recorded in `window.__platoVitals`. Page-transition animation not done
- [x] Page map for the assistant: stable `data-ai` names on key controls in the frontend code, one registry (`chat/page-registry.ts`: path, purpose, controls per page), a `describe_page` tool, and a spec that fails if a registry name is missing from the frontend code. Live DOM scan only adds changing content (rows, values)
- [x] Human-like control: cursor glides, scrolls and presses (sidebar link then the row, never a typed URL); one page action per turn; multi-step tasks continue by themselves (max 5); a control from another page opens that page first. `CHAT_MODEL=gpt-4.1-mini`

**Done when:** the three-step example (remote marketing jobs in Europe → only ones accepting Egypt → open first and tailor a resume) works in one conversation.

## 2. Global job discovery: 20 new sources

**Today:** 11 Apify board actors (Indeed, Glassdoor, ZipRecruiter, Google Jobs, Talent, Jobbank, Jobillico, Dice, Handshake, BuiltIn, Wuzzuf) + LinkedIn + ATS sources (Greenhouse, Lever, Workable, Ashby) + local index. New board = new definition in `discovery/adapters/boards/` plus an entry in `BOARDS`. Most existing boards are US/CA only.

Sources to add: Himalayas, We Work Remotely, Remotive, Jobgether, Jobicy, Remote OK, Working Nomads, Wellfound, Upwork, Contra, Toptal, Arc, FlexJobs, NoDesk, Dynamite Jobs, Bayt, GulfTalent, Naukrigulf, Adzuna, Jooble.

- [x] **Legal/technical check, per source:** done for all 20 in [SOURCES_LEGAL.md](plato-native-be/SOURCES_LEGAL.md) with evidence level. **16 of 20 integrated** (4 free feeds, 2 keyed APIs, 10 Apify boards). 4 not built, with reasons: FlexJobs (actor returned 0 results, $0.09 per run), Upwork (actor timed out), Contra and Toptal (actors scrape people, not jobs). Wellfound and We Work Remotely carry the highest terms risk; `DISABLED_BOARDS` switches boards off. Needs owner/lawyer sign-off before launch
- [x] Free official APIs first: Remotive, Jobicy, Remote OK, Himalayas run now; Adzuna and Jooble run once keys are set. Checked live against the real payloads
- [x] One mapper per source into `NormalizedJob`: the four free feeds and Adzuna/Jooble in `open-feeds.adapter.ts`, and ten Apify boards (Bayt, Naukrigulf, GulfTalent, We Work Remotely, Working Nomads, Wellfound, Arc, Dynamite Jobs, Jobgether, NoDesk) in `adapters/boards/`. Each has a card in the search progress; all are manual-apply and link to the listing
- [x] Gulf coverage: Bayt, Naukrigulf and GulfTalent run through Apify (limited-permission actors) for UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman (Bayt also Egypt, Jordan, Lebanon, Morocco); Jooble adds more once keyed. Naukrigulf is the priciest at about $0.009 per job
- [x] Cross-source duplicate detection: same company (normalised) + title + country or "remote"; merged within a run (the company's own ATS copy wins) and against stored jobs within 14 days
- [x] Expired-job detection: background check every 6 h (100 jobs, each rechecked after 3 days) for Greenhouse, Lever, Workable and the free feeds; closed postings are hidden. Boards that block bots (LinkedIn, Indeed, Glassdoor...) and Ashby are not checked
- [x] Classify each job at ingest: profession (15 groups), employment type (full/part/contract/freelance/internship/graduate/temporary), arrangement (existing)
- [x] Eligibility: remote jobs that accept Egypt (`acceptsCountry` + card line, earlier), pay-currency filter (`salaryCurrency`, e.g. USD/EUR) in the API, the assistant and the results bar. Also fixed "USA"/"United States" not being recognised as a region
- [x] Exclude manual-labour roles at ingest (phrase list with a professional-title override: "Delivery Driver" dropped, "Delivery Manager" kept)
- [x] Per-source metrics: every run writes a `discovery.source` event per source (fetched, status, error) and Apify spend is recorded per actor run. The free feeds cost $0

## 3. Unified Plato job listings

- [x] Job card shows company (with logo or initials), title, location, salary, type, arrangement and an eligibility line (open / restricted / relocation / none stated, computed per seeker from the posting's stated regions and location); source is a footnote and the Source filter was removed from the results bar
- [x] Keep original source internally: `source` stays on every row and API item; only the display changed
- [x] Small footer link "Original posting · via <board>" on every card; boards get a "via" credit by default (conservative) and company career systems (Greenhouse, Lever, Workable, Ashby) do not. Adjust per board once licences are checked (section 2)
- [x] Never imply Plato is the employer or original publisher: the title links to the original posting, and the results header says listings come from public sources and Plato is not the employer
- [x] Company normalisation: one spelling at ingest and on read, one key for dedupe ("Microsoft Corp.", "MICROSOFT CORPORATION" → Microsoft); logo only from the employer's own website domain (never a job board's). Applications list and detail views still show platform tiles (operations view)

## 4. AI resume builder and per-job ATS optimisation

**Today:** resume engine with strategy, fact-gated writer, PDF render and page-limit checks; build from the Career chat; auto-apply tailors one resume per application. ** NOTE ** auto apply will be cancelled as we will make it as a chrome extension instead of in app feature...

- [x] Build a resume from the profile, tailor to a job description, download PDF
- [x] No invented facts (claims gate, quote rule)
- [~] Bulk: select N jobs, generate N tailored resumes in a queue with progress  => CANCELLED (auto-apply moves to a Chrome extension)
- [x] Review and edit in the UI before use: edit headline, summary, skills and bullets; "Rewrite" regenerates one part (fact-checked); saving makes a new version. Employers and dates stay in Profile
- [x] ATS keyword coverage report: headline mirrors the job title only when the profile proves that work (Full Stack CV for a Frontend job); posting's spelling used for skills you have; proven-but-unlisted job terms added; score plus matched/left-off terms shown on the resume card
- [x] Upload existing CV as the base for editing: paperclip in the Career chat (PDF/Word); the text goes to the assistant as the seeker's own words, facts are saved with the usual quote rule
- [x] Store versions per target role (v1, v2...) with one approved version; auto-apply is cancelled, so the Chrome extension can read the approved version later
- [ ] Credits cost per resume shown before generating (see 8) => SUSPENDED (we will apply it after finishing purchasing and plans module)

## 5. Job-specific AI mock interviews

**Today:** text practice, mock and skill-proof modes in Career chat (generic, from profile). Not tied to a listed job, no storage, no voice.

- [x] Practice, mock and skill-proof modes (text, streaming)
- [x] "Start mock interview" on any job card (bot icon, text): the model reads the posting and the profile and writes 6 questions (3 technical, 2 behavioural, 1 situational). Module `interview`, pages `/career/interviews`, `/career/interviews/[id]` (linked from the Career page header)
- [x] Follow-up questions based on the answer (at most one per question)
- [x] Structured scorecard (per-question score, communication, strengths, gaps, next steps; overall 0-100 computed in code) saved in `mock_interviews`
- [x] Session history, score bars over time, retry the same questions
- [x] Voice mode: live two-way voice call (browser <-> OpenAI Realtime over WebRTC, interruptions work), practice / mock / skill-proof, optional pasted job description, 15-minute cap, transcript saved into the chat. Model `gpt-realtime-mini` (env `REALTIME_MODEL`). Not yet tied to a job card
- [ ] Abuse/cost guard: done without credits (8 questions max, 1 follow-up each, 4000 chars per answer, 10 new interviews per 24 h); credits still open (see 8)

## 6. AI skills gap and opportunity unlocker

**Today:** `confirm_skill` records verified skills with a quote from the seeker; resume gaps list required skills with no evidence.

- [x] Aggregate missing skills across relevant jobs: `GET /job-seeker/skills/gap`, page `/career/skills`. Looks at the 300 best non-hidden, non-expired matches; skills come from a curated word list (`skills-gap.ts`), no model call per job; "missing" reuses the resume gap rule (profile, projects, confirmed skills)
- [x] Course/certification catalogue: 30 hand-picked paths from Google, Microsoft, IBM, Meta, AWS, DeepLearning.AI, Linux Foundation, HashiCorp, CompTIA, Scrum.org, PMI, freeCodeCamp, HubSpot, Salesforce and others (`skills/catalog.ts`), each with provider, kind, approximate cost and duration and the provider's link. Links were opened on 2026-10-13; prices are approximate, so the card sends you to the provider. Each gap on `/career/skills` shows its ways to learn, free first
- [x] "Jobs unlocked" estimate per skill: jobs where that skill is the only gap on the word list
- [x] Mark a course "I'm taking it" or "I finished it", with a public certificate link and/or an uploaded certificate file (stored as a CERTIFICATE document). Model `SkillCredential`
- [x] Verify certificates via issuer links: the server opens the pasted link (https only, a short list of issuers: Coursera, Credly, Microsoft, Accredible, Credential.net, freeCodeCamp, Scrum.org, Trailhead, Skillshop, HubSpot, AWS/Pearson; redirects must stay on a listed issuer) and looks for your name and the course. VERIFIED or SELF_REPORTED, shown as such. This is a link check, not the issuer's own confirmation: pages that load details with JavaScript stay self-reported. An uploaded file always stays self-reported
- [x] Verified items flow into the profile: a certification entry (used on the resume), working-level skill evidence (never lowering a stronger one) and the skill in the profile's skill list (used for matching). Self-reported ones are listed but never used as evidence

## 7. Company subscriptions and job alerts

**Today:** a notifications module and bus exist; nothing about followed companies.

- [ ] Follow/unfollow companies (model + UI section "Followed companies")
- [ ] Monitor company career pages and permitted sources on a schedule; detect new openings
- [ ] Alert filters: title, country, location, seniority, type, remote/hybrid/on-site
- [ ] Delivery frequency per user: instant, daily digest, weekly digest
- [ ] De-duplicate so one vacancy never notifies twice
- [ ] Channels: in-app first, then email
- [ ] "Apply through Plato" from the notification where supported

## 8. Subscription plans, AI credits and usage limits

**Today:** Plato tokens are live in code (2026-10-26): every metered run is charged to its seeker, plans, limits, the web app's balance and the admin report are built. Payments are not. See [plato-native-be/CREDITS.md](plato-native-be/CREDITS.md).

- [x] Plan model: Free / Pro / Max as monthly Plato-token grants (1,000 / 7,000 / 25,000, env `CREDITS_*_MONTHLY`); `setPlan` starts a fresh period with the new grant. See [plato-native-be/CREDITS.md](plato-native-be/CREDITS.md)
- [ ] Payment provider and monthly billing; for Egypt check a local gateway (Paymob/Fawry) and local-currency prices. Needs a merchant account; its webhook only has to call `setPlan` (plans) or `adjustTokens` (top-ups)
- [x] Credits ledger ("Plato tokens", 1,000 = $1 of our cost): `credit_accounts` + append-only `credit_ledger`, free plan grant on first use, monthly reset to the grant without a cron (no roll-over), every `recordUsage` event charged by its real cost (AI by model price, Apify boards by a fixed price per result per platform), auto apply exempt. `GET /job-seeker/credits` (balance, reset date, history) and `GET /job-seeker/credits/prices`. Env: `CREDITS_USD_PER_TOKEN` (default 0.001), `CREDITS_FREE_MONTHLY` (default 1000). Run `npm run prisma:push`
- [x] Cost table per action, based on measured cost: every action costs its real cost in tokens (`credit-prices.ts`); browsing is free, AI replies cost by model, job boards by a fixed price per result per platform, voice per minute
- [x] Show cost before the action and remaining credits and reset date everywhere: balance + bar in the sidebar (chip on mobile), `/tokens` page (balance, refill date, what things cost from real averages, history), the voice call shows its length and cost per minute before it starts, and any 402 opens one "Not enough Plato tokens" dialog with the refill date
- [x] Enforce limits server-side: `TokensGuard` answers 402 `insufficient_tokens` (balance + refill date) on every paid route; a deep search asks the paid boards for only as many results as the balance covers (free sources always run, the chat says so); a voice interview is as long as the balance allows, reserved at start and settled on the transcript against the server's clock (the browser's token report is capped, `CREDITS_VOICE_USD_PER_MINUTE`); career research web search calls are now priced
- [x] Failed or empty runs do not consume credits: done for Apify boards (a run with 0 results, or whose results could not be read, is free); AI calls that error before a response are never metered
- [x] Admin view: `GET /admin/credits/report` (our cost vs tokens charged per feature and top 50 seekers, plus unattributed cost), `GET /admin/credits/:user`, `POST /admin/credits/:user/adjust`, `POST /admin/credits/:user/plan` (user id or email, `x-admin-key`)
- [ ] Re-measure with real traffic for 2 weeks, then fix prices

---

## Cross-cutting

- [ ] Run `npm run prisma:push` once on every environment (adds `usage_events`)
- [x] Set `CHAT_MODEL=gpt-4.1-mini` in the local `.env` (nano misses multi-step tool use); set it on every other environment too
- [ ] Confirm the Cloudflare R2 token is least-privilege (Object Read & Write on the one bucket) and rotate the one pasted in chat
- [ ] Search is stored with its countries; check that multi-country answers are not reduced to one (an Egypt-only search skipped US/CA boards)
- [ ] Rate-limit and auth review on the new streaming endpoint
- [ ] Acceptance tests for each feature using fixtures, not the real database

---

## Conclusion: where this stands (2026-10-14)

**Done: 44 items** across sections 1 to 6, including this session's last blocks (all of section 2 except the 4 sources that cannot be built, section 3, section 6, the voice interview, and the Career experience). Every `[x]` above is built, type-checked, tested with fixtures and builds; none of the work was run end to end in a real browser by me.

**What is left (23 open items, 1 cancelled)**

1. **Section 7, company follows and alerts (7 items).** Not started. Needs: a follow model and UI, a scheduled check of company career pages, alert filters, digest frequency, de-duplication and in-app then email delivery. Reuse: the notifications bus and the ATS adapters already poll company boards.
2. **Section 8, plans, payments and credits (9 items).** Not started. Needs: plan model, a payment gateway (check Paymob or Fawry for Egypt), a credits ledger with monthly reset, a cost table per action, cost shown before each action, server-side limits and an admin margin view. The numbers to start from are in [MEASURED_COSTS.md](plato-native-be/MEASURED_COSTS.md) ($3 per deep search, $0.06 for onboarding + chat + resume).
3. **Waiting on section 8 (2 items):** the credit cost shown before a resume, and the credits part of the interview abuse guard.
4. **Cross-cutting (5 items):** run `npm run prisma:push` on every environment; rotate the R2 token that was pasted in chat; confirm multi-country searches keep every country; rate-limit and auth review of the streaming endpoint; acceptance tests with fixtures.
5. **Small gaps inside finished sections:** page-transition animation (section 1); FlexJobs, Upwork, Contra and Toptal could not be built (section 2).

**Before launch (not code):** get sign-off on the terms of the scraped boards (Wellfound and We Work Remotely are the riskiest, `DISABLED_BOARDS` switches boards off); check Jooble's and Adzuna's terms and first live responses once keyed; confirm the realtime voice prices on OpenAI's page; run each feature once with real accounts (voice call, certificate link check, a search that reaches the new boards) and read the costs from `/admin/usage/summary`.

