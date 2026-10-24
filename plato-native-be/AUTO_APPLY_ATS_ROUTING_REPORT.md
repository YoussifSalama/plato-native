# Auto-apply: ATS routing by URL + Ashby adapter

Report of the work done to extend auto-apply from 3 ATS sources to routing
by real application host, plus a 4th ATS (Ashby) submit adapter.

## Problem

Auto-apply (`plato-native-be/src/modules/apply/apply.service.ts`) only
submitted for jobs whose `Job.source` (the discovery board) was directly
`LEVER`, `WORKABLE`, or `GREENHOUSE`. `ASHBY` was discovered but had no
submit adapter. Every other board — `GOOGLE_JOBS`, `ZIPRECRUITER`,
`GLASSDOOR`, `TALENT`, `JOBBANK`, `JOBILLICO`, `DICE`, `HANDSHAKE`,
`BUILTIN`, plus `LINKEDIN`/`INDEED`/`WUZZUF` — was discovery-only.

The bug: routing keyed strictly on `job.source`, but the existing ATS
adapters (`adapters/{workable,greenhouse,lever}.adapter.ts`) are
**host-agnostic** — `loadForm(jobUrl)` just parses whatever URL it's given.
So a job discovered via Dice/Glassdoor/Google Jobs/etc. whose real
`apply_url` happened to be a `boards.greenhouse.io` / `jobs.lever.co` /
`apply.workable.com` link was a job Plato could already submit — it just
never got routed there, because `job.source` said `DICE`, not `GREENHOUSE`.

## Decision (confirmed with the user)

Route by the **real ATS host on the job's URL**, not by which board
discovered it. Build a 4th adapter for Ashby (the one genuine ATS missing
one). Explicitly exclude `LINKEDIN`, `INDEED`, `WUZZUF` from this expansion
regardless of what their URL shows — those require the candidate's own
account/login on that platform (the future "agent-apply" tier, not this
round). No new "requires account" schema field — solved entirely by
detecting the ATS host on the job's existing `apply_url`/`url`.

## What changed

### 1. `apply/ats-detect.ts` (new)

Single source of truth for routing:

- `detectAtsHost(url)` — matches a URL's hostname against
  `workable.com`, `greenhouse.io`, `lever.co`, `ashbyhq.com`.
- `effectiveApplySource(job)` — the ATS that should actually handle a job:
  - `LINKEDIN` / `INDEED` / `WUZZUF` → always `null` (never routed, even if
    the URL happens to match an ATS host).
  - `LEVER` / `WORKABLE` / `GREENHOUSE` / `ASHBY` → trusted directly.
  - Every other board → `detectAtsHost(apply_url ?? url)`; `null` if no ATS
    host matches (stays discovery-only, same as before).

### 2. Ashby submit adapter (new)

`apply/forms/ashby.form.ts` + `apply/adapters/ashby.adapter.ts`.

Ashby's application form is **not** plain-HTTP fetchable like the other
three ATSs — this was verified against a real public posting
(`jobs.ashbyhq.com/notion/...`), not guessed:

- The static HTML/`window.__appData` carries only posting metadata, no form
  fields.
- The real form loads via a GraphQL call the page itself makes:
  `POST jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting`, returning
  `data.jobPosting.applicationForm.sections[].fieldEntries[]` with typed
  fields (`String`, `Email`, `Phone`, `Location`, `File`, `Boolean`,
  `ValueSelect`, `MultiValueSelect` all confirmed live; a few more types are
  best-effort mapped from Ashby's naming convention and flagged in code).
- So `loadForm` opens a throwaway headless page and captures that GraphQL
  response instead of doing a `fetch()`, a deliberate, documented deviation
  from the other adapters' "plain HTTP" contract.
- Every rendered field sits inside a `[data-field-path="<path>"]` container
  in the DOM — confirmed by capturing the rendered form's HTML — which
  `submit()` uses as a uniform selector for every field type (fill text
  inputs, click Yes/No buttons for booleans, click matching option labels
  for choice/multi, type+pick for the location autocomplete, direct
  `setInputFiles` for the resume). Submit button:
  `button.ashby-application-form-submit-button`. Human-check (Ashby uses
  reCAPTCHA) is handled by the existing shared `human-verification.ts` —
  no new code needed there.
- A real fixture captured from that live posting lives at
  `apply/forms/__fixtures__/ashby-notion.json` and backs `apply/ashby.spec.ts`.

Wired in: `apply.types.ts` (`ApplySource` gains `'ASHBY'`),
`apply.module.ts` (provider registration), `apply.service.ts` (constructor
injection + adapters map).

### 3. `apply.service.ts` — routing overhaul

Every place that filtered or keyed by raw `job.source` now uses
`effectiveApplySource(job)` instead:

- `SUPPORTED: JobSource[]` → `APPLY_SOURCES: ApplySource[]`.
- Adapter map, circuit-breaker maps (`humanChecks`, `pausedUntil`) keyed by
  `ApplySource` instead of `JobSource`.
- `parkUnsupported`, `requeueResolved`, `recordOutcome`, `queueStatus`,
  `claimNext` — Prisma can't express the URL-sniff as a single `where`
  clause without duplicating the regex table into the query layer, so these
  now fetch by `status` (with `job: { source, apply_url, url }` selected)
  and filter in JS with `effectiveApplySource`. `claimNext` takes a bounded
  `take: 200` scan (flagged as a ceiling to revisit if a paused ATS's
  backlog ever grows past that).
- `tripBreaker` / adapter selection in `process()` / `continueVerification`
  — keyed by the **detected** ATS, not the discovery board, so a
  Dice-discovered Greenhouse job and a directly-discovered Greenhouse job
  correctly share one circuit breaker against the same real site.

### 4. Frontend follow-up

`discoveryService.listApplications` and `applyService.getOne` (backend) now
attach `effective_ats_source` to each returned job. The applications list
and detail pages (`plato-job-seeker-native-fe/app/(app)/applications/`)
compare against that field instead of raw `job.source`, so a
Dice/Glassdoor/etc.-discovered job whose real form is on an ATS Plato
supports shows correctly as "supported" / "paused" in the UI.

### 5. No changes needed

`eligibility.ts` and `readiness.ts` were already fully source-agnostic
(title/description/candidate-profile matching only) — confirmed by reading
both files in full, nothing to change.

## Files touched

**New:**
- `plato-native-be/src/modules/apply/ats-detect.ts`
- `plato-native-be/src/modules/apply/ats-detect.spec.ts`
- `plato-native-be/src/modules/apply/adapters/ashby.adapter.ts`
- `plato-native-be/src/modules/apply/forms/ashby.form.ts`
- `plato-native-be/src/modules/apply/ashby.spec.ts`
- `plato-native-be/src/modules/apply/forms/__fixtures__/ashby-notion.json`

**Edited:**
- `plato-native-be/src/modules/apply/apply.service.ts`
- `plato-native-be/src/modules/apply/apply.types.ts`
- `plato-native-be/src/modules/apply/apply.module.ts`
- `plato-native-be/src/modules/discovery/discovery.service.ts`
- `plato-job-seeker-native-fe/lib/jobs/api.ts`
- `plato-job-seeker-native-fe/app/(app)/applications/page.tsx`
- `plato-job-seeker-native-fe/app/(app)/applications/[id]/page.tsx`

## Verification

Per standing rule (no scripts against real Plato data), verified with
fixtures/tests and a real third-party posting, not the app's own DB:

- `npx jest src/modules/apply` → **8 suites, 83 tests passing** (existing
  suites unaffected; 2 new suites, 14 new tests, covering the core
  scenario — a `DICE`-sourced job with a `boards.greenhouse.io` apply_url
  routes to `GREENHOUSE`, LinkedIn/Indeed/Wuzzuf always excluded even when
  the URL matches, and the Ashby form normalizer against the real captured
  fixture).
- `npx tsc --noEmit` clean on both `plato-native-be` and
  `plato-job-seeker-native-fe`.
- `eslint` clean on every touched file.
- Ashby's GraphQL shape, DOM `data-field-path` pattern, and submit button
  selector were captured live against a real public Notion/Ashby posting
  (Playwright, headless, read-only — no application was ever submitted).

## Follow-up: live smoke test (done after this report was first written)

Ran the real `AshbyApplyAdapter` (`loadForm` + `submit` in dry-run) via
`ts-node` against the live Notion posting used throughout — not a
reimplementation, the actual production code. Every field type
(text/email/phone/url/choice/boolean/multi) filled and verified correct in
the DOM; screenshot confirmed visually.

**Found and fixed a real bug this way**: `pickLocation` used `.fill()` on
the location autocomplete, which never triggers Ashby's debounced geocode
search — the field silently stayed empty (confirmed in the first
screenshot). Switched to `.pressSequentially()`, matching the existing
Lever adapter's own location-autocomplete handling elsewhere in this
codebase. Re-ran the smoke test: location now fills correctly
("Cairo, Cairo, Egypt" selected from the real dropdown).

Also hardened `forms/ashby.form.ts`: a **required** field with an unmapped
Ashby type now logs a warning naming the field instead of silently
dropping it (optional unmapped fields still drop silently, matching the
existing Greenhouse/Lever/Workable convention). 2 new tests added
(`ashby.spec.ts`, now 85 tests passing across the apply module).

## Not done / known limits

- The 8 remaining boards (Google Jobs, ZipRecruiter, Glassdoor, Talent,
  JobBank, Jobillico, Dice, Handshake, BuiltIn) get no board-specific
  submit logic. They're now auto-picked-up **only when** their `apply_url`
  happens to resolve to one of the 4 ATS domains; anything else stays
  discovery-only, same as before this change.
- Ashby's confirmation-after-submit detection (`THANKS` wording / submit
  button disappearing) is still best-effort — the *fill* path was verified
  live end-to-end (above), but a real successful *submission* was
  deliberately never sent (would have applied to a real job at a real
  company). Flagged in code (`adapters/ashby.adapter.ts`) to verify the
  first time it runs live in dry-run-off mode.
- A few Ashby field types (`LongText`, `Number`, `Date`, `URL`) are mapped
  from Ashby's own naming convention but weren't seen on the one real
  posting inspected — flagged in `forms/ashby.form.ts`, and now at least
  surfaced with a warning instead of failing silently if wrong.
