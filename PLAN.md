# Plato — Jobs Flow Implementation Plan

Target: 5 mockup screens (Jobs Discover, Check Requirements, Applying, Done, + shell) in 3 days.

## Decisions (lazy, reversible)

| # | Decision | Why |
|---|---|---|
| 1 | `/jobs` is a 3-state page: **chat hero** (full width, no search yet) → **searching** (stepper + animated sources, chat in aside) → **results** (mockup 5 layout: list + right Plato panel + bottom chat bar) | Reconciles spoken flow (chat-first) with mockups (list-first) |
| 2 | Greeting = string template from snapshot, no LLM call | User's example is template-shaped; zero latency |
| 3 | Search params = orchestrator tool `start_job_search(params)`; zod params default to saved preferences, agent overrides from chat; agent expands titles to related roles (≤3, LinkedIn adapter cap) | "AI outputs clean JSON params" without a second agent |
| 4 | Async discovery = `DiscoveryRun` row + in-process background promise + client polls every 3s | No queue/websocket lib. `ponytail:` BullMQ when multi-instance |
| 5 | Chat persisted: `ChatThread` + `ChatMessage`; thread = the "search session" id notifications link to | User asked for history, isolation, clickable IDs |
| 6 | Match % = BM25 score / max score for that seeker; ≥90 Excellent, ≥75 Strong | Cheap, monotone with existing ranking |
| 7 | Notification center = bell dropdown listing runs (status, counts) → `/jobs?thread=` | Enough for "clickable notification" |
| 8 | `/auth/me` gains `onboarding_completed`; login → `/jobs` if true else `/onboarding`. Home page = Day 3 | User said returning users go Home; Home not built yet |
| 9 | Onboarding `POST /chat` stays stateless as-is | Don't break working onboarding assistant |
| 10 | Journey canvas = **React Flow** (nodes/edges/camera) + **Motion** inside nodes; edge pulses via SVG `animateMotion` | Mature graph layer, custom nodes are plain React; no per-frame JS for pulses |
| 11 | Journey is an arrival-ordered log of real SSE events; only pacing (≈0.5s between reveals, payoff beat) is client-side | "Don't fake with timers"; late joiners replay the snapshot |
| 12 | Chat: **assistant-ui** adopted on Day 2 with attachments + streaming (where it pays off); **CopilotKit** not adopted — second runtime, orchestrator lives in Nest; drawer = same thread as a second surface | One brain, many surfaces |

## Day 1 (today) — Jobs Discover end-to-end

Backend
- [x] Prisma: `ChatThread`, `ChatMessage`, `DiscoveryRun` (+ `discovery_run_id` on match)
- [x] `DiscoveryService.startRun / executeRun / getRun / listRuns`; per-source status; `getMatches` gets `runId`, filters, `total`, `match_percent`
- [x] Real-time pipeline progress: `run.progress` (crawling → merging → filtering → ranking → done) + SSE `GET /job-seeker/discovery-runs/:id/events` (in-process bus; `ponytail:` Redis pub/sub when >1 instance)
- [x] Orchestrator agent (snapshot in prompt, `start_job_search` tool, ranking handoff)
- [x] Routes: `POST/GET /chat/threads`, `GET /chat/threads/:id`, `POST /chat/threads/:id/messages`, `GET /job-seeker/discovery-runs[/:id]`
- [x] `/auth/me.onboarding_completed`
- [x] Jest: query merge, match percent, progress reducers, greeting (10 tests)
- [ ] End-to-end run against real Apify (needs OK — costs credits)

Frontend
- [x] App shell `(app)/layout.tsx`: sidebar nav (Home, Jobs, Applications, Messages, Profile) + placeholders
- [x] `/jobs`: chat hero → live searching flow (SSE, poll fallback) → results (filters, pagination, selection panel, bottom Plato bar, drawer chat)
- [x] Notification bell (runs list, unread badge, click → `/jobs?thread=`)
- [x] Redirects (ready step → `/jobs`, login → by `onboarding_completed`, `/` → by auth state)
- [x] `tsc --noEmit` + lint + `next build`
- [ ] Browser walkthrough (not done from this session — no browser tool)

## Day 2 — Check Requirements (mockup 1)
- `Application` model (job_seeker, job, status queue) + `POST /applications` from selection
- Requirements agent: per selected job, derive missing docs/info from description vs profile → aggregated checklist
- Orchestrator gains profile tools (already in `ai/agents/profile/tools`) + file upload in chat → document version
- Screen: checklist cards, uploads, yes/no + salary inputs, "I've provided everything"

## Day 3 — Applying + Done (mockups 2–4) + Applications page + Home
- Apply handoff agent (per-source adapters; LinkedIn Easy Apply / Workable / Lever) — stubbed status machine first
- Progress polling UI, summary sidebar, Done state
- `/applications` list, `/` Home (returning users)

---

# Auto-apply recovery plan (after the 2026-09-19 audit)

**Where we are.** 37 applications, 0 submitted. 28 Workable: every form that reached
Submit hit Cloudflare's "Verify you are human"; the answers Plato had typed were not
safe to send (salary `1,000,020,000`, years `13`, invented current salary, a filler
sentence in URL fields). Lever: 0 attempts. Full findings: the audit in the session log.

**Decision 2026-09-19 (product owner):** no dry run any more. Lever and Workable
always submit. `APPLY_DRY_RUN=true` survives only as a developer switch for building
new adapters. Protection lives in the pipeline: eligibility check, typed answers,
pre-send validator, the failure doctor, and SUBMITTED only on the site's own
confirmation. (Superseded rule: "nothing goes live until a reviewed dry-run batch".)

## Phase 0 — Stop the risk (same day, ~1h)
- [x] ~~Default `APPLY_DRY_RUN` back to true~~ reversed by the decision above: always submit.
- [x] "Try again" on a row respects dry run (no accidental live send).
- [x] Banner on Applications already explains dry run; a dry run now ends as
      "Ready for you to submit" (prepared answers + preview), not "failed".
Done when: a retry fills the form, saves the screenshot, sends nothing.

## Phase 1 — Answers that are safe to send (1–1.5 days)
Root cause: answers are free text, fields are typed.
- [x] **Typed fields in the schema**: keep Workable's `number`, `date`, URL-looking
      text (`/url|link|linkedin|github|portfolio/` in the label) as their own field
      types instead of collapsing to `text`. Lever: same from card field types.
- [x] **Typed answers**: number → one integer (expected salary = target, not a
      range; years = computed from work history; notice period in the unit the label
      asks for: days / weeks / months); date → ISO date; URL → a saved link or
      *nothing*; never a sentence.
- [~] **Salary model** (target = max ?? min; `current_salary` is an intake fact;
      a separate `salary_target` column not added): store `salary_target` alongside min/max + currency + period;
      add optional `current_salary`. Convert period (month/year), never currency;
      when the label names another currency, give ours with its code only if the
      field is text, otherwise treat as "unknown fact".
- [x] **No invented facts**: a question about a fact we don't hold (current salary,
      date of birth, manager's title…) is "unknown", never derived from a different
      fact and never filled with the interview sentence. Filler sentence stays only
      for open essay questions.
- [x] **Pre-send validator** (pure function, unit-tested on the audit's real forms):
      per-type checks, max length, option membership, no internal notes
      (`snapshot`, `not supported`, `grounded`), no placeholder text. Any failure →
      the application does not send and says which answer failed.
- [x] Audit regression specs (`audit-cases.spec.ts`, field definitions copied from
      the real forms). Original item: save the 6 real Workable form JSONs from the audit + the Lever page;
      specs assert the exact answers for the audit's failure cases.
Done when: dry-run batch over those forms shows 0 malformed answers.

## Phase 2 — Ask once: the intake question bank (1 day)
Root cause: forms ask facts the profile doesn't have. (User's item 3.)
- [x] Intake bank (`apply/intake.ts`, facts in `JobSeeker.apply_facts`). Original: `apply-intake.json` next to `onboarding-options.json`: key, question, answer
      type, where it's stored, when to ask (always / only if a form needed it).
      Seed from the audit: target salary (number), current salary (optional), notice
      period, total years, work authorization, country of residence, LinkedIn /
      GitHub / portfolio, English level 1–10, hourly rate (optional), university +
      graduation year (from education when present), willing to work onsite/hybrid.
- [x] **Sensitive, always optional, default "prefer not to say"**: gender, pronouns,
      date of birth, marital status, military status, health, driving licence.
      A form that *requires* one of these with no decline option → that application
      is skipped with that reason; Plato never guesses.
- [x] **Remove the consent question** from readiness (it is the service; covered by
      accepting the terms at signup). Readiness = facts only.
- [x] Chat agent asks everything unanswered in one batch before the first search
      (tools already exist: `get_application_readiness`, `save_application_details`
      → extend to the bank). Onboarding Preferences step renders the same bank.
- [x] **Learn from failures**: every "unknown required fact" is recorded per seeker;
      the agent asks for it once, the answer joins the bank, and the affected
      applications re-queue by themselves (mechanism exists: `requeueResolved`).
Done when: re-running the audit's 14 "couldn't answer" forms in dry run leaves only
sensitive-required ones unanswered.

## Phase 3 — Apply to the right jobs, once (1 day)
Root causes: no eligibility check; the same role posted per location.
- [~] **Dedupe at the source** (queue-time + worker guard done; collapsing
      location variants in the results list not done): one application per employer + normalised title;
      results list collapses location variants into one row ("6 locations").
      Worker-side guard stays as the safety net.
- [x] **Eligibility gate** (rule-based, in the worker: shows as "Skipped by Plato"
      with the reason and an "Apply anyway"; LLM tier not added). Original: (cheap rules first, LLM only for the rest):
      core stack overlap (a Java/Spring role vs a Node/React profile = no),
      location + work authorization ("must be based in LATAM / US"), seniority and
      required years vs history, management roles only if held, posting language.
      Ineligible jobs are not queued; the reason is shown on the row.
- [ ] "Apply to top 15" = top 15 *eligible distinct roles*, preferring sources Plato
      can actually apply on.
- [ ] Ranking: penalise missing must-have skills instead of rewarding keyword overlap.
Done when: the audit batch (Java, Eng Manager, lakhs, LATAM-only) would not be queued.

## Phase 4 — Lever rehearsal (0.5 day)
- [ ] Dry-run batch on 10 of the seeker's 26 recommended Lever jobs; review answers
      and screenshots; fix selector/field issues found.
- [ ] Record how hCaptcha behaves at Submit (decision input for Phase 5). This needs
      one deliberate live attempt on a posting the seeker really wants.

## Phase 5 — How applications actually get submitted (decision, then 2–5 days)
Workable blocks the automated browser with a human check on 100% of submits. Plato
will not use CAPTCHA-solving services or stealth evasion. Options, pick one:
- **A. Browser extension (recommended).** Plato prepares the full answer set server
  side; the extension fills the employer's form inside the seeker's own browser and
  the seeker (a real human, present) presses Submit / ticks the box. Scales per
  user, no server browsers, matches how established products in this space work.
- **B. Assisted mode.** Visible Chrome on the operator's machine, a person clicks
  the box. Already supported (`APPLY_HEADLESS=false`). Fine for demos, doesn't scale.
- **C. Employer / partner APIs.** Clean but needs agreements per employer; long term.
- **D. Prepared hand-off.** Plato produces answers + cover letter + resume and a
  one-click "open and paste" flow. Least automation, zero platform risk.
Until decided: Workable/Lever applications end as "Ready for you to submit" with
everything prepared, instead of "failed".

## Added: the failure doctor (done)
On a failed attempt Plato no longer retries blindly. An AI reads the failure (error,
fields the site flagged, the form, the answers sent), states the cause in plain
words, and either patches the answers (validated by the same typed gate) and retries,
or names the fact it needs from the seeker. Max 2 repairs per application. Never
used on human checks, closed postings or skips. Shown on the application page as
"What Plato worked out".

## Phase 6 — Make failures legible (0.5 day, can run alongside)
- [x] Failure taxonomy on the row (`human_check`, `unknown_fact`, `invalid_answer`,
      `ineligible`, `duplicate`, `closed`, `site_error`) → the dashboard shows why
      applications don't go through, per site.
- [ ] Always keep a screenshot on failure (done) and the timeline (done).
- [ ] A site that keeps failing pauses itself and says so (done for human checks;
      extend to repeated site errors).

## After this (the user's other requests, unchanged)
1. Plato's index as a source for every user (match on skills/description, drop the
   7-day crawl rule, remote/relocation aware, nightly top-title crawls).
2. Richer search parameters (all locations, experience level, job type, remote with
   location; budget weighted to sources Plato can apply on).
3. Files in chat → profile updates → snapshot.

**Order:** 0 → 1 → 2 → 3 → 4 → decide 5 → build 5. Phase 6 alongside.
**Estimate:** ~5 working days before the Phase 5 build.

---

# Discover adapters — Canada + USA boards (discover only, no apply)

**Decision 2026-09-25:** none of these boards has a public read API (ZipRecruiter,
Talent.com, Glassdoor = partner/publisher only; Google shut its jobs API in 2021; Job Bank =
XML feed on request; Jobillico API is post-only). So: **Apify for every source**, same as
LinkedIn. Free keyed aggregators (Jooble, Adzuna) skipped for now.

**Shape.** One `BoardsAdapter` runs every `BoardDef` (`adapters/boards/<name>.ts`) that
covers the seeker's country (CA / US, detected from `query.locations`). Each def =
Apify actor id + `input()` + `map()`. Failure of one board never fails the run. Progress shows
one grouped "Job boards" card (`SourceKey: 'boards'`). Discovery only: `easy_apply: false`,
no apply handler.

| # | Source | Countries | Actor (Apify) | Status |
|---|---|---|---|---|
| 0 | Infra: `BoardsAdapter`, country detect, `boards` progress key, FE tile fallback | CA+US | — | [x] |
| 1 | Indeed | CA, US | `automation-lab/indeed-scraper` ($0.003/listing) | [x] built + tested (no live run yet) |
| 2 | Google for Jobs | CA, US | `scrapesage/google-jobs-scraper` | [x] built + tested (no live run yet) |
| 3 | ZipRecruiter | CA, US | `agentx/ziprecruiter-jobs-scraper` (US, CA, UK, IE) | [x] built + tested (no live run yet) |
| 4 | Glassdoor | CA, US | `automation-lab/glassdoor-jobs-scraper` | [x] built + tested (no live run yet) |
| 5 | Talent.com | CA, US | `cirkit/talent-com-jobs-scraper` (direct ATS apply URLs) | [x] built + tested (no live run yet) |
| 6 | Job Bank Canada | CA | `parsebird/jobbank-canada-scraper` | [x] built + tested (no live run yet) |
| 7 | Jobillico | CA | `jobsapi/jobillico-jobs-search-scraper` | [x] built + tested (no live run yet) |
| 8 | Dice | US | `parsebird/dice-jobs-scraper` | [x] built + tested (no live run yet) |
| 9 | Handshake | US | `memo23/handshake-jobs-scraper` | [x] built + tested (no live run yet) |
| 10 | Built In | US | `benthepythondev/builtin-jobs-scraper` | [x] built + tested (no live run yet) |
| — | LinkedIn CA/US | CA, US | already built (`LinkedInAdapter`) | [x] |
| — | Jobboom | CA | no actor found; skip unless one appears | [ ] |

**Per source, same loop:** read actor input schema + output sample (Apify store page, free)
→ write `boards/<name>.ts` → mapper unit test on a fixture item → `tsc` + jest.
"(verify)" = actor picked from search results, output shape not read yet.
Live actor runs cost credits: none until the user OKs one (see Day 1 open item).

Schemas read from `https://api.apify.com/v2/acts/<user>~<actor>/builds/default` (public, free): exact input enums + dataset field names. Mappers are written against those names, so the first live run is what confirms real output.

**Frontend (done 2026-09-25).** Each board = own card, same as Lever/Workable. Backend
progress keys are the lower-cased `JobSource` (`indeed`, `google_jobs`, ...); a run only
lists boards searched for the seeker's country (`BoardsAdapter.sourcesFor`). FE:
`SOURCE_LABEL` in `lib/jobs/api.ts` is the single source list; journey cards wrap in rows
of ≤8; `SourceTile` letter tiles; copy + login demo updated. Not eyeballed in a browser.

**Country as a real control (2026-09-25).** `DiscoveryQuery.countries` (ISO-2) is derived once
from the seeker's places (`discovery/countries.ts`), overridable from chat (`start_job_search.countries`).
It now decides: which boards run (`BoardsAdapter.marketsFor`), LinkedIn places (one run per country, capped),
ATS `locationSearch`, Workable places, and a hard drop of jobs based elsewhere (public boards + local index;
remote jobs pass). Relocating seekers search the whole of their chosen countries. Wuzzuf added (EG).
Fix from first live run: ZipRecruiter `location` is an object → `locationText()` + `clean()` guard for every
board; persisting a run now skips a malformed job instead of failing the whole run.

**Smart search intake (2026-09-25).** New search → Plato shows ONE interactive card (`ask_user_questions`:
residence, target countries, work setup, visa, employment, min salary), pre-filled from the profile (the profile is the
backup when they skip). Answers return as a "My answers:" message. `check_salary_expectation` (`discovery/salary-sanity.ts`,
static rough bands + FX) triggers a single "Are you sure?" when pay looks off for where they live / want to work.
Country detection: ICU-backed full-world rules (`countries.ts`) + model fallback for unknown places
(`country-resolver.ts`, cached). `ChatMessage.ui Json?` stores the card; FE `question-card.tsx`.
Not yet: min salary as a search filter; live check that the model calls the card tool reliably.
