# How Plato applies, per platform

One row per `JobSource` (`prisma/schema/job.prisma`). "Method" is how a job
from that source actually gets submitted today, after the ATS-host-routing
change (see `AUTO_APPLY_ATS_ROUTING_REPORT.md`).

| Source | Method | Notes |
|---|---|---|
| `WORKABLE` | **Direct ATS adapter** | `adapters/workable.adapter.ts`. Real Playwright submission. |
| `LEVER` | **Direct ATS adapter** | `adapters/lever.adapter.ts`. Real Playwright submission. |
| `GREENHOUSE` | **Direct ATS adapter** | `adapters/greenhouse.adapter.ts`. Real Playwright submission. |
| `ASHBY` | **Direct ATS adapter** | `adapters/ashby.adapter.ts` (new). Real Playwright submission; form read via a captured GraphQL call, not plain HTTP. Live-tested against a real posting. |
| `GOOGLE_JOBS` | **Routed if it resolves to an ATS, else discovery-only** | Google Jobs is a pure aggregator: its "apply" link always deep-links to wherever the original posting actually lives. If that's `boards.greenhouse.io` / `jobs.lever.co` / `apply.workable.com` / `jobs.ashbyhq.com`, `effectiveApplySource` catches it and one of the 4 adapters above applies. Anything else (an arbitrary company site) stays discovery-only — handed to the seeker with a link. |
| `TALENT` | **Routed if it resolves to an ATS, else discovery-only** | Same as Google Jobs: Talent.com mostly redirects to the original posting's own destination. |
| `JOBBANK` | **Routed if it resolves to an ATS, else discovery-only** | Canada's government job board. Applications go through whatever method the employer set (a link, an email address, or in-person) — no single native apply system of its own. |
| `JOBILLICO` | **Routed if it resolves to an ATS, else discovery-only** | Has its own "Postuler" (apply) flow, but it's an account-based candidate-profile system built for Jobillico's own funnel, not a guest form — out of scope, same bucket as the account-gated platforms below if ever revisited. For now: only picked up when the listing's own link is one of the 4 ATSs. |
| `BUILTIN` | **Routed if it resolves to an ATS, else discovery-only** | Media/job-board site, not an ATS. Predominantly links straight to the employer's own careers page or ATS. |
| `ZIPRECRUITER` | **Routed if it resolves to an ATS, else discovery-only** | Has its own "1-Click Apply", but that requires a ZipRecruiter candidate account — it's how ZipRecruiter builds its own candidate database. Not guest-apply, so not built. Non-1-click listings ("Apply on Company Site") behave like any other board: picked up only if that company site is one of the 4 ATSs. |
| `GLASSDOOR` | **Routed if it resolves to an ATS, else discovery-only** | Same shape as ZipRecruiter: "Easy Apply" needs a Glassdoor account, external listings behave like a plain board. |
| `DICE` | **Routed if it resolves to an ATS, else discovery-only** | Same shape again: Dice's own "Easy Apply" needs a Dice account; other listings redirect externally. |
| `LINKEDIN` | **Excluded — account-gated** | LinkedIn Easy Apply requires the seeker's own LinkedIn login. Explicitly out of scope this round (the deferred "agent-apply" tier in the README). Discovery-only, never routed, regardless of URL. |
| `INDEED` | **Excluded — account-gated** | Same reasoning as LinkedIn. |
| `WUZZUF` | **Excluded — account-gated** | Same reasoning as LinkedIn. |
| `HANDSHAKE` | **Excluded — account-gated** | Closed platform: a verified school/employer account is required just to view a posting, let alone apply. Added to the exclusion list alongside LinkedIn/Indeed/Wuzzuf in `ats-detect.ts` (was missed in the first pass, added after review). |

## The pattern in one sentence

There are really only three buckets, not sixteen:

1. **A genuine ATS with a per-company, guest-fillable application form**
   (Workable, Lever, Greenhouse, Ashby) — Plato has a real submit adapter
   and fills/submits the form itself.
2. **An aggregator/board with no native apply system of its own**
   (Google Jobs, Talent, JobBank, Jobillico, BuiltIn, and the *external*
   listings on ZipRecruiter/Glassdoor/Dice) — Plato applies automatically
   **only when** the listing's real application link happens to resolve to
   one of the 4 ATSs in bucket 1 (`ats-detect.ts`'s `detectAtsHost`).
   Otherwise the job is discovery-only: shown to the seeker with a link.
3. **A platform whose own apply flow requires the seeker's account on
   that platform** (LinkedIn, Indeed, Wuzzuf, Handshake, and the native
   "1-click"/"Easy Apply" flows on ZipRecruiter/Glassdoor/Dice/Jobillico) —
   never auto-applied. This is the deferred "agent-apply" tier: acting
   through the seeker's own login, not built.

No source needs a bespoke adapter beyond the 4 already built — bucket 2's
jobs are already reached through bucket 1's adapters when their real
destination matches, and bucket 3 is a different, larger feature
(browser automation through someone else's login) that hasn't been
scoped, let alone started.

## Status of the one open item from this report

The `HANDSHAKE` exclusion (bucket 3, missed in the first pass) has been
added to `ats-detect.ts`'s `ACCOUNT_GATED` set and a matching case added to
`ats-detect.spec.ts`. **Not yet re-verified with the test suite/typecheck**
after this specific edit — do that before considering it done.

## Decision (2026-09-29): scope split, final

Zero-click backend auto-apply is scoped to bucket 1 + bucket 2 only —
anything whose real application form is a guest-fillable ATS (Workable,
Lever, Greenhouse, Ashby), reached either directly or through host-sniffing
an aggregator's listing. This is the entire `effectiveApplySource` surface
already built; no further platforms are being added to it.

Bucket 3 (LinkedIn, Indeed, Wuzzuf, Handshake — account-gated) will **not**
get a backend session-automation adapter. The chosen path is a **Chrome
extension** running in the seeker's own logged-in browser instead. This
replaces the "deferred agent-apply tier" language above as the concrete
plan for bucket 3, not backend Playwright-with-stored-credentials.

## Live test results (2026-09-30)

Ran all 4 direct-ATS adapters standalone (no DB, dry-run — form filled,
screenshot taken, submit click never fired) against real, currently-open
postings, found live via search and pre-checked for a 200 status:

| Adapter | Real posting | Result |
|---|---|---|
| `LeverApplyAdapter` | `jobs.lever.co/palantir/...` | ✅ 27 fields loaded, filled, dry-run OK |
| `GreenhouseApplyAdapter` | `boards.greenhouse.io/mark43/jobs/8154030` | ✅ 18 fields loaded, filled, dry-run OK |
| `GreenhouseApplyAdapter` | `boards.greenhouse.io/cloudflare/jobs/7946795` | Correctly detected as closed and stopped — a stale search result, not a bug (verified independently: the human-facing page 301-redirects to Cloudflare's own careers page) |
| `AshbyApplyAdapter` | `jobs.ashbyhq.com/clera/...` | ✅ 3 fields loaded, filled, dry-run OK. Logged a warning: `LinkedIn` field has Ashby type `Url`, unmapped, dropped from the form — worth checking whether this makes a real submission fail when the LinkedIn field is `required` |
| `WorkableApplyAdapter` | `jobs.workable.com/view/...` | ✅ 4 fields loaded, filled, dry-run OK |
| `WorkableApplyAdapter` | `apply.workable.com/mediaradar/j/...` | ❌ **Real bug** — see below |

### Bug found: `apply.workable.com` postings are silently unreachable

`ats-detect.ts`'s `HOST_TO_ATS` regex is `/(^|\.)workable\.com$/i` — it
matches **any** `*.workable.com` subdomain, so a listing whose real apply
link is `apply.workable.com/{company}/j/{id}` (confirmed live, HTTP 200,
a normal Workable ATS page — this is the more common employer-facing
Workable URL shape, distinct from Workable's own aggregated
`jobs.workable.com/view/{id}/` board mirror) gets tagged `WORKABLE` and
routed to `WorkableApplyAdapter`.

But `workableJobId()` (`forms/workable.form.ts:13`) only parses the
`/view/{id}/` path shape. On an `apply.workable.com` URL it returns `null`,
and `workable.adapter.ts:40` throws `PermanentApplyError('Not a
jobs.workable.com posting URL')` — every single time, for every posting on
that URL shape. Not a flaky failure; this is a systematic miss for however
much of Workable's real-world traffic uses `apply.workable.com` over
`jobs.workable.com`, and it hasn't been sized (no data yet on what
fraction of Workable postings Plato's discovery layer actually surfaces in
each shape). Not yet fixed — flagged here for a follow-up ticket.
