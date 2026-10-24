# Engine audit, 2026-10-23

Question from the owner: is the apply engine a fixed "inspect → AI → fill → submit" sequence that needs a rebuild, or an observe/act/verify/recover loop with gaps? Audited after the 10-platform run (see `AUTO_APPLY_TEST_REPORT_2026-10-23.md` in the repo root).

## Verdict

**Keep the loop. Do not rebuild.** `src/panel/ai-apply.ts` already runs, per page: settle → look → one AI decision → fill → read back → repair (only failed fields) → press → look again, bounded (16 pages, 5 idle looks, 2 repair rounds, Submit pressed once). Nothing in it, in `dom/*` or in the backend decision knows a site's name. That is the architecture the pasted advice asks for.

What is wrong is narrower and sits in five places. Every one of the 16 findings maps to one of them. None needs a site rule.

| Layer (advice) | What exists | Gap | Findings |
|---|---|---|---|
| 1 Page understanding | `dom/inspect.ts` (controls, labels, choices, custom roles, shadow DOM), `dom/snapshot.ts` (≤50 buttons/links, 1500 chars of text, `[role=alert]` texts), `dom/settle.ts` (DOM+network quiet) | Snapshot region is `main` or a dialog: an Apply control outside it is invisible. Inspection takes ONE form (`rootFor`): identity fields in a second form, or a body-level cookie banner, are wrongly included/excluded. Errors are page-level text, never tied to a field. A file input's state is re-read from the field list, which the page can replace. | F9, F11, F16, F14 |
| 2 Decision | One call (`page-decide.agent.ts`): page type, every fill, missing, next move, ask; `finishDecision` + `guardPlan` re-check the model | `finishDecision` drops every fill with `grounded: false`. A required yes/no or location `<select>` is not a profile fact, so the model marks it ungrounded, it is dropped, becomes "missing", Submit is blocked. Dates: no rule says "derive from availability", so the model asks. | F3, F5 |
| 3 Action executor | `dom/fill.ts`: native setter + events, per-kind fill, type-ahead, tick lists, file upload, `readBack` after every write; CDP presses | Per-widget behaviour is where it breaks: phone widgets that split the country code, Ashby's inputs, Greenhouse's re-render flagging. These are widget adapters (by behaviour, reused across sites), not site adapters. The stale `aria-invalid` layer is fixed; the Greenhouse one is not. | F1b, F6, F7 |
| 4 Recovery | Repair round for failed fields with the page's alert text; `guardPlan` refuses a press that already failed twice; `wait` bounded by idle looks | After Submit the loop only polls for a confirmation 12 s and then returns `unconfirmed` → VERIFY. It never re-inspects the page for new validation errors and repairs. The same `ask` is re-raised on every Try again because the stop reason is not compared with the previous one. | F4, F15 |
| 5 Durable state | Server item state machine (contract), lease + heartbeat, per-item journal in `chrome.storage.session`, resume choice on the item | Journal and sessions die with the service worker: a reload loses heartbeats (lease taken back) and resumes through the legacy review-rows path. Concurrency slots are `state.sessions`, which still holds stopped items. | F10, F12 |

Nothing in the AI loop is wrong enough to replace. The prompt is not the problem either: Spanish questions, EEO boxes, consent, cover text all came out right.

## What to change, in order

Each item is generic, has a "done when" that a unit test or a runtime flow can check, and lands in the layer above. Fixtures: save the real DOM of each of the 10 pages from today's run (the driver can `page.content()`), one fixture per failing widget, not per site.

1. **Decision gate for choices and dates (layer 2).** In `finishDecision`, a fill for a field WITH options is kept even when `grounded` is false, as long as it snaps to a real option (the model chose, the gate checks the choice exists). Add two answer rules: a required choice question is always answered with the strongest option the profile supports, or the option the posting implies (location = the job's location); a date question is answered from availability ("immediately" → today, "1 month" → today + 30 days) in the format the label asks for. Done when: Lever's location select and JazzHR's five yes/no selects are filled from a fixture, the start date is a formatted date, no `ask`. Spec: `page-decide.spec.ts`.

2. **Validation errors per field, read after every failed move (layers 1 + 4).** Inspector reports, per field, the error text next to it (`aria-describedby`, `aria-errormessage`, the nearest `[role=alert]`/error node inside the field's container). After `press submit` with no confirmation: settle, re-inspect, and if any field now carries an error, run the normal repair round with those errors and decide again (one extra page, counted in MAX_PAGES), instead of `unconfirmed`. `unconfirmed` only when nothing changed and no error is shown. Done when: a fixture form that rejects Submit with inline errors ends `confirmed` after one repair; `test/runtime` flow added.

3. **Observation completeness (layer 1).** Snapshot controls from the whole document, not `main`, with the dialog first when open (keeps BambooHR's Apply link; cap stays 50, ordered dialog → main → rest). Inspection: fields of ALL visible forms in the region, tagged by form (the B1 whole-page review already exists for "several forms"; make it the default), minus anything inside a cookie/consent banner (`[id*=cookie i]`, `[class*=consent i]`, `aria-label` with cookie, and any dialog that holds no text input). File fields: `hasValue` read from the input's `files` or the widget's shown filename each inspection, so an upload survives a re-render. Done when: Recruitee `/c/new` fixture lists name/email/phone; Teamtailor fixture lists no cookie boxes; a fixture whose form re-renders after upload keeps the resume as uploaded.

4. **Widget adapters in the executor (layer 3).** Three behaviours seen today: (a) phone inputs whose widget keeps the national number and a separate country control: accept the shown digits as the national tail of the wanted number, or set the country control first; (b) inputs that take the value only through real key events (Ashby): when the native setter does not stick, type through CDP `Input.insertText`; (c) Greenhouse's new UI: capture the fixture and find which event it needs. All keyed on observed behaviour (`shows()` mismatch class), never on the host. Done when: each has a fixture in `test/fixtures/dom/` and a `dom-fill.spec.ts` case.

5. **Durable state and slots (layer 5).** Journal and session table in `chrome.storage.local` (per item, trimmed), restored on panel start so an adopted item resumes `runAi`, not the legacy rows; heartbeat sent by the service worker alarm, not the panel; a stopped item (NEEDS_USER / VERIFY) leaves `state.sessions` so its slot frees; a new stop with the same reason as the item's last stop is recorded once and not re-raised until the page signature changes. Done when: runtime flow "reload mid-run" keeps the lease and resumes; four stopped items do not block the fifth; `/extension/stops` shows one entry per distinct (item, reason, page).

6. **Only then: new providers and the generic host permission (B5).** With 1-5 in, add the 6 ATS fixtures to `test/runtime`, then move to optional host permissions so any host runs through the same loop.

## Phase 1 status (2026-10-24, decision gate)

Done, code first, one evidence-backed prompt line last:
- `finishDecision` keeps an ungrounded CHOICE when every part snaps to a real option and the label is not a fact question (`isFactQuestion`: authorization, residence, background, licence, consent, demographics, plus the sensitive intake labels). Facts stay with the seeker.
- Profile rules run inside the decision, before `missing` and the move: `yearsAnswer`, and the new `dateAnswer` (availability → start date in the label's format; a signature "Date" → today; replaces a word like "immediately" in a date field).
- Backend logs every decision (`[AnswersService] decide <item>: fields … fills … missing … next`) and decide errors. Specs: `page-decide.spec.ts` (+4), `date-answer.spec.ts`.
- Prompt: "a field with options is never left empty; a fact the profile does not show is not guessed".

Real pages (batch of Lever, JazzHR, Greenhouse): dates verified on Greenhouse ("When Are You Available To Start? (mm/dd/yyyy)" = today) and JazzHR (signature Date = today, EEO radio = decline). Lever's location select still comes to the model as `opportunityLocationId [choice, 2 options]`, not required (the ✱ is in a sibling div), and the model skips it even with the rule: it needs Phase 3 (question text for name-labelled controls, required mark near the control) and Phase 2 (the page's "required" error after Submit feeds a repair). JazzHR's five selects were not visible in this round (the page showed only the EEO block) and it stopped on a real reCAPTCHA.

Side findings fixed on the way: rows the page already holds (browser restore, autofill) counted as gaps ("not a valid choice") → now "Already on the page"; staged values whose rows vanished were dropped silently → now journaled; resume choice was saved fire-and-forget and the file fetched at once → "No resume chosen" race → awaited.
Side findings open: Lever shows "File exceeds the maximum upload size of 100MB" for the 44 KB resume (DataTransfer upload at Lever); Greenhouse Infuse raises a "Security code" bot challenge after a few rounds (human check: stop is right, detect it as captcha instead of "unlabelled fields").
Harness notes: a backend restart during a decision shows as "Plato's AI could not be reached (Network error)" in the panel; `chrome.runtime.reload()` disables a `--load-extension` build (restart the browser instead).

## Phase 2 status (2026-10-24, validation errors + repair)

Done, tests first, then real pages:
- Inspector: `FieldInfo.error` per control: `aria-errormessage`, then `aria-describedby` (when the control is `aria-invalid` or the text reads as an error), then an error node inside the control's own box (nearest ancestor with no other control). Page-level alerts stay in the snapshot. Fixture `errors.html`, spec in `dom-inspect.spec.ts`.
- Rows: `mergeRows` turns a filled row whose field now carries a page error into `failed / page-rejected` (value kept for the repair); the error reaches the decision and the repair as the field's hint; a row the page flagged joins the repair even when the decision gave it no value; a page error outranks "the box holds a value" in the gap list.
- Loop: new optional dep `afterSubmit()` (re-inspect, journal the field errors). After a Submit that nothing proved: errors → repair → if something was fixed, the page is decided again and Submit may be pressed a second time; nothing fixed → needs-user with the page's words; no errors → `unconfirmed`. `MAX_SUBMITS = 2`, never a third press. Specs: 4 cases in `ai-apply.spec.ts`, `mergeRows` case; runtime flow F (`rejects.html`: the page refuses Submit with an inline "This field is required." on a select, the repair fills it, the second Submit confirms).

Real pages:
- Recruitee (Enersee): the path ran end to end: Send → the page showed three field errors ("This field is required and can not be left empty." on Full name, Email, GitHub) → read, tied to the right fields, carried into the repair. The repair could not make them stick (the typed text sits in the inputs but Recruitee's own state stays empty: a widget behaviour, Phase 4) → the run stops with the page's words. Before the precedence fix the loop pressed Send a second time; after it, one press.
- Ashby (ZOE): Submit refused silently: no error text, no `aria-invalid` anywhere; inputs empty (fill does not stick, F6, Phase 4). Outcome `unconfirmed`, no resend: correct for a page that says nothing.
- Lever (Redbee): the model now stops before Submit and asks the seeker to pick Bogota or Lima (the posting lists both); the location list still reaches it unlabelled and not required (Phase 3).
- JazzHR (BAM): the form is replaced after the resume upload; 7 staged values were for rows no longer on the page (now journaled; Phase 3/5 re-render handling).

## Rules for every future fix (so it stays generic)

- A fix names a behaviour (a widget, a page shape, an error pattern), never a provider id. `grep provider ===` in the engine should stay empty.
- Every fix lands with a fixture of the real page that showed it and one spec; the runtime harness replays it.
- The AI proposes; code verifies. A field is "filled" only after `readBack`; an application is "submitted" only on page proof; an `ask` is raised only once per (reason, page).
- Site-specific exceptions go into a small adapter file with a dated reason, after the generic path was shown not to cover it.

## Not needed

- A new backend, a new prompt per ATS, a form-mapping store (deleted today), or a second engine. The current loop plus the five changes above covers the 16 findings.

---

# Phase 2 Exit Review — Evidence and Architecture Decision

Written 2026-10-24 01:30 by the implementation agent. The reviewer decides; this section is evidence, with the agent's reading of it marked as such.

## 1. Executive verdict (agent's reading)

**Keep the engine; continue with bounded, generic capability work (Option 1 shading into Option 2 at one boundary).** No evidence found that the observe → decide → act → verify → recover control flow blocks any failure class. Every reproduced failure classifies as a local defect (A), a missing generic capability (B) or an external limitation (D). One state-management boundary (sessions, journal and slots living in panel memory / session storage) is the only candidate for a targeted refactor (Option 2) and it is small. Confidence: medium. What would change it: a page where the loop itself (not an executor adapter) must be bypassed to complete an application, or a second instance of duplicate/conflicting actions after the slot/lease fix.

## 2. Baseline and actual test results

Repository: the workspace root and `plato-extension` are not git repositories; `plato-native-be` is at `12b270b` with a large pre-existing uncommitted working tree (prisma, career, chat, discovery, extension, apply modules) that predates this work and was not touched for Phase 2. Phase 2 therefore cannot be shown as a diff; its files are listed below.

Phase 2 files (extension only; no backend change): `src/dom/types.ts` (`FieldInfo.error`), `src/dom/inspect.ts` (`errorOf`), `src/core/form-review.ts` (`Row.error`, `mergeRows` page-rejected rule), `src/panel/ai-apply.ts` (`afterSubmit`, `MAX_SUBMITS`), `src/panel/main.ts` (`afterSubmit` glue, hints, gap list, repair rows), fixtures `test/fixtures/dom/errors.html`, `test/fixtures/pages/rejects.html`, specs in `test/dom-inspect.spec.ts`, `test/ai-apply.spec.ts`, `test/form-review.spec.ts`, runtime flow F in `test/runtime/run.mjs` + `servers.mjs`. Out of Phase 2 scope but done on the way (documented in the Phase 1/2 status above): gap list treats rows the page already holds as present; staged values for vanished rows journaled; resume choice awaited; backend decision log line. One prompt line was added in Phase 1 (choices), none in Phase 2.

| Suite | Command (from the package dir) | Before Phase 2 | Now |
|---|---|---|---|
| Backend | `npx jest` | 371 passed | **371 passed, 5 skipped, 1 suite skipped** (68 of 69 suites) |
| Extension unit | `npx vitest run` | 212 passed | **219 passed, 1 skipped** (22 files) |
| Extension runtime (real Chromium, fixtures build, local servers) | `npm run test:runtime` | 19 ok | **20 ok** (flow F added) |

No failures. Run 2026-10-24 ~01:10–01:25 on this machine.

## 3. Phase 2 behaviour verification

**A. Field-level error association** (`dom/inspect.ts` `errorOf`, order fixed in code): `aria-errormessage` → `aria-describedby` only when the control is `aria-invalid` (described text that reads as an error, else the first) → an error-looking node (`[role=alert]`, `[aria-live]`, class/id containing error/invalid/validation/help-block) inside the control's own box, where the box is the nearest ancestor that contains no other control (radio/checkbox siblings of the same name excepted), at most 4 levels, never past form/fieldset/body. Text must contain an error word and must not equal the label. Verified by `test/dom-inspect.spec.ts` on `errors.html`: positive cases (describedby+invalid, errormessage, container node, hidden node ignored, clean field none) and negative cases (page-level `[role=alert]` not attached; two controls in one row with a shared error node: neither takes it; described-by help text "Please include https://" on a non-invalid control: not an error; a cookie banner outside the form: not a field, not an error). The negative test found and fixed one false positive in this review (help text with "please"). Limits: a site that renders its error far from the control with no ARIA link is not associated (reported as page alert only); a row layout that puts several controls in one box loses their errors by design (no borrowing).

**B. Recovery after a dead Submit** (`ai-apply.ts`): Submit pressed once → 12 looks for a confirmation → none → `afterSubmit()` (panel: settle, `ctl.reinspect()`, journal field errors) → errors present → `repair()` (AI repair with each field's own error in its hint; rows the page flagged join even if never staged) → if the still-failing list is shorter than the error list, the page is decided again (errors in the hints) and Submit may be pressed once more; else `needs-user` with the page's words. No errors → `unconfirmed`. `MAX_SUBMITS = 2`. A reload, timeout or ambiguous outcome never presses again (flows B, C, D unchanged and green). Verified by 4 loop specs, `mergeRows` spec, runtime flow F (page refuses Submit with an inline required error on a select; repair fills it; second Submit confirms; exactly one POST). Real pages: Recruitee ran the whole path (3 errors read on the right fields, repair, values rejected again, stop with the page's words; before the gap-list precedence fix the loop pressed Send twice, after it once); Ashby refused silently → `unconfirmed`, one press.

**C. Safety and stopping**: facts stay grounded (`isFactQuestion` gate, Phase 1 spec: authorization/background choices dropped when ungrounded); sensitive intake labels never guessed; captcha/anti-bot → `needs-user` (`page-state.ts` frames + text, `providers/generic.ts`), observed live on JazzHR (reCAPTCHA) and Greenhouse ("Security code" challenge after several rounds, detected only as unlabelled fields: see inventory); ambiguous outcome reported as `unconfirmed`/VERIFY and never resent (flows B–D, Ashby live); repair bounded per field (`MAX_ATTEMPTS = 3`, `form-review.ts`) and per application (`MAX_SUBMITS = 2`, 2 repair rounds, 16 pages, 5 idle looks). Identical repeated asks across separate Try-again runs are NOT yet suppressed (F15, open).

**D. Checklist coverage**: ARIA association ✔, non-ARIA container error ✔, multiple fields with different errors ✔ (errors.html: three), errors appearing only after Submit ✔ (flow F), repair touches only failed rows ✔ (`aiRepair` row filter + `retryFailed` targets; `form-review.spec`), no repair when no error ✔ (loop spec "no field error"), repair limit ✔ (`MAX_ATTEMPTS`, loop "never a third press"), no resend without evidence ✔ (loop specs, flows B–D), `unconfirmed` when nothing actionable ✔, factual/sensitive fields ✔ (`page-decide.spec`).

## 4. Known-failure inventory (status 2026-10-24)

Classification: A local defect, B missing generic capability, C architectural limitation, D external, E insufficient evidence. "Rebuild?" = does this item argue for a rebuild.

| # | Finding | Status | Confidence | Class | Rebuild? | Next action (scope) |
|---|---|---|---|---|---|---|
| F3 | Required choice/select omitted | Partly fixed: gate keeps ungrounded non-fact picks (spec); live, the model still skips Lever's unlabelled, not-required `opportunityLocationId` and asks the seeker to pick Bogota/Lima | high | A (inspector label/required) + B (decision never leaves an option field empty) | no | Phase 3: question text from the preceding block for name-labelled controls; star mark near the control → required. ~1 day + fixtures |
| F5 | Dates from availability | Fixed (`dateAnswer`, spec); live on Greenhouse and JazzHR (today's date, mm/dd/yyyy) | high | A | no | none |
| F4 | Validation errors after Submit | Fixed (Phase 2); live on Recruitee | high | B (now present) | no | none |
| F1b | Greenhouse identity inputs flagged after typing | Reproduced twice; after the stale-aria fix the values reach the DOM but the page keeps "is required" | medium | B (widget adapter: inputs that need key events) | no | Phase 4: CDP `Input.insertText` fallback when the native setter does not stick; fixture of the Infuse page. ~1 day |
| F6 | Ashby inputs do not take values | Reproduced 3× (fields empty after fill; Submit refused silently, no error node) | medium | B (same adapter as F1b) | no | same as F1b; Ashby fixture |
| F7 | Workable phone widget splits the country code | Reproduced once (run 1: "10000000") | high | A (`shows()` digit comparison) | no | accept national tail / set the country control first. hours |
| F8 | SmartRecruiters apply UI site error | Reproduced once ("form temporarily unavailable" on oneclick-ui) | low | E (could be D: bot check) | no | open the page by hand in a normal browser; if it loads, capture and classify |
| F9 | BambooHR Apply control not found | Reproduced once (listing page, "control not on the page") | medium | A/B (snapshot region = `main`/dialog; the Apply link likely outside) | no | Phase 3: whole-document snapshot ordered dialog → main → rest; BambooHR fixture |
| F10 | Extension reload drops lease/heartbeat/resume path | Reproduced ("server took it back", legacy review rows after reload) | high | C-lite: state boundary (sessions, journal in panel memory / `storage.session`) | **the one candidate for a targeted refactor**; not a rebuild | Phase 5: durable per-item state in `storage.local`, heartbeat from the service worker alarm, resume into `runAi`. 1–2 days |
| F11 | Cookie banner controls inspected as fields | Reproduced once (Teamtailor, whole-page review) | high | A | no | Phase 3: exclude consent banners in `inspectForm`/`listForms`. hours |
| F12 | Stopped items hold concurrency slots | Reproduced (4 stops blocked 6 waiting jobs) | high | A in `state.sessions` accounting; related to F10 | no | release the slot on NEEDS_USER/VERIFY. hours |
| F14/F15 | Resume upload lost after re-render; same ask repeated (Personio 12, Teamtailor 11 stops) | Reproduced; JazzHR variant: form replaced after upload, 7 staged values lost (now journaled) | medium | B (observation after page transition: re-inspect + re-stage after a form swap; file state read from the input) + A (repeat-ask suppression) | no | Phase 3/5. 1–2 days |
| F16 | Recruitee identity block missed by the inspector | Not reproduced in Phase 2 runs: the inspector reads Full name/Email/Phone on `/c/new` (decision log 2026-10-24); run-1 reading was a timing effect | high | A (was timing; closed) | no | none |
| F13 | Spanish answer formatting ("per monthly") | Reproduced (cosmetic) | high | A (prompt wording) | no | later |
| F3-Lever | Lever location select optional/mislabelled | Reproduced 4× | high | A (inspector) | no | see F3 |
| F19 | Lever "File exceeds 100MB" for a 44 KB resume | Reproduced once (page error text), cause not established (DataTransfer File vs Lever's reader?) | low | E | no | reproduce with a fixture that reads `files[0].size`; check the bytes decoding in `setFile` |
| F-GH | Greenhouse "Security code" anti-bot challenge | Reproduced twice; seen by the engine as 8 unlabelled required fields, stopped as "did not settle" (a stop, but with the wrong reason) | high | D + A (detect it as a human check) | no | add the pattern to `page-state.ts` HUMAN_TEXT/frames; stop reason `login-or-captcha` |
| F17 (new) | Values the browser restored before our fill counted as gaps | Fixed (gap list: user-edited / hasValue rows are present) | high | A | no | none |
| F18 (new) | Staged values dropped silently when the form is replaced | Journaled now; not yet re-staged | high | B (same as F14) | no | Phase 3 |
| F20 (new) | Resume choice fetched before it was saved | Fixed (awaited) | high | A | no | none |

Pattern: 13 of 19 are A, 5 are B, 1 is C-lite (F10, with F12), 1–2 are D/E. The B items share two capabilities: an executor fallback for inputs that need real key events (F1b, F6), and re-observation after a page transition (F14, F18, partly F9). Neither needs a change to the loop or to the backend decision.

## 5. Controlled browser evaluation

Setup held constant: same dummy seeker, same backend, same headed Chromium profile (`driver.mjs`), same production build per run (rebuilt between runs as fixes landed; the build time is in the panel header and in each run's note). Real postings were used because no sandbox ATS pages exist; the owner authorised dummy applications. No application was confirmed, so no real employer received one.

| Run (build) | Eligible attempts | Confirmed | Submit pressed | Pressed twice | Duplicate / false success | Stops for the seeker | Outcome classes |
|---|---|---|---|---|---|---|---|
| Run 1, 2026-10-23 19:08–19:50 (pre-Phase 1; F1/F2 hotfixed mid-run) | 10 (one per provider) | 0 | 3 (Lever, Ashby, Recruitee) | 0 | 0 | ~35 (`/extension/stops`) | 2 VERIFY→FAILED (Lever, Ashby), 1 FAILED (Recruitee), 7 CANCELLED by owner in needs-user/review; 2 user-handoffs were correct (JazzHR reCAPTCHA later, Greenhouse challenge) |
| Phase 1 check, 23:52–00:40 (3) | 3 | 0 | 0 | 0 | 0 | ~12 | Greenhouse → anti-bot challenge (D), Lever → asked seeker (A/B), JazzHR → reCAPTCHA (D) |
| Phase 2 check, 00:49–01:05 (5 attempts over 3 batches) | 5 | 0 | 3 (Recruitee ×2, Ashby) | 1 (Recruitee, before the gap-list fix; 0 after) | 0 | ~10 | Recruitee: errors read + repair + stop (B widget); Ashby: silent refusal → unconfirmed (B); Lever: asked seeker; JazzHR: form replaced (B) |
| **All real pages** | **18** | **0 / 18** | 6 | 1 | 0 | 57 total in `/extension/stops` | — |
| Fixture flows (`npm run test:runtime`, deterministic) | 6 application flows | 3 / 3 that submit (A, E, F) reach SUBMITTED_CONFIRMED with exactly one POST each; B, C, D end in VERIFY by design | — | 0 | 0 | — | — |

Manual interventions on real pages: every attempt needed at least one (Try again, "I did not submit it", answering salary/notice period via preferences). Time to first stop on real pages: 15–90 s. Wasted time: the repeated asks (F15) and the slot blockage (F12) dominated run 1 (~20 minutes of a 40-minute run with 6 jobs idle).

Attribution of the 18: engine (A/B) 12, external (captcha, challenge, site error) 4, seeker decision legitimately required 2 (Lever location both-cities; Greenhouse US-hours question). Caveat: the same posting was reused across runs (Lever, JazzHR, Recruitee, Ashby); the browser profile carried restored values on Lever, which changed the second-run behaviour (F17) — a controlled comparison needs a fresh profile per run.

Completion rate on real pages is therefore 0 of 18, and the fixture rate is 3 of 3. The gap is explained field by field in section 4; no attempt failed inside the loop's control flow.

## 6. Three options

| | Option 1: incremental, generic capabilities in the current engine | Option 2: targeted refactor of the state boundary only | Option 3: full rebuild |
|---|---|---|---|
| Expected effect on confirmed completions | Addresses F1b/F6 (adapter), F14/F18 (re-observe after transition), F3/F9/F11 (inspector), F-GH (challenge detection): these account for 12 of 18 engine-attributed stops. Qualitative: from 0/18 to "most pages without captcha". Confidence medium: the adapter for key-event inputs is unproven until the Ashby/Greenhouse fixtures exist | Adds reliability across reloads and frees slots (F10, F12): affects throughput and wasted time, not completion per attempt | Unknown. A rebuild re-implements the same five layers; the failures are in widget/observation details a rebuild must still solve one by one |
| Effort | 4–8 engineer-days across Phases 3–5 | 1–2 days, can run inside Option 1 as Phase 5 | 3–6 weeks to parity (loop, inspector with shadow DOM / custom roles / type-ahead / tick lists, fill with CDP, state machine + lease, 220 unit + 20 runtime tests) |
| Regression risk | Low: each change lands with a fixture and the runtime harness replays | Low–medium: touches sessions/heartbeat; flows B–D guard it | High: everything verified today (flows A–F, CSP, pairing, policy) must be re-proven |
| Maintenance | Unchanged: fixture per behaviour, no site branches | Slightly lower (one state store) | Unknown; same class of per-widget work recurs |
| Compatibility | Full: backend decision API, item state machine, lease/heartbeat, UI, tests unchanged | Full: server contract unchanged | Must keep the contract or rewrite the backend too |
| Migration / rollback | None needed; each phase is a build | Behind a build; rollback = previous build | Parallel path + feature flag; long double-maintenance window |
| Solves | A and B classes | C-lite (F10, F12) | Nothing the others do not, unless a loop-level limitation appears |
| Cannot solve | D (captcha, site errors), seeker-only decisions | same | same |

## 7. Facts vs hypotheses

Facts: all counts in sections 2 and 5; the journals and `[AnswersService] decide` log lines quoted in the Phase 1/2 status; Recruitee's DOM after Submit (typed values present, `aria-invalid`, three "required" messages); Ashby's DOM after Submit (inputs empty, no error node); Lever's field list as the model saw it (`opportunityLocationId [choice, 2 options]`, not required); JazzHR's 7 vanished staged values; the anti-bot pages.

Hypotheses: that Recruitee/Ashby/Greenhouse inputs accept CDP-inserted text (untested; the adapter is the smallest next experiment); that SmartRecruiters' error is site-side rather than bot detection; the cause of Lever's "100MB" message; that durable state alone removes the "server took it back" path (the heartbeat may also need the service-worker alarm).

## 8. Confidence and what would change the verdict

Medium. For keeping the engine: 18 real attempts and 6 fixture flows show the loop doing what it is meant to do at each step (decide once per page, fill, verify, read errors, repair once, stop honestly) while the failures sit in the executor, the inspector and state durability. Against: zero confirmed completions on real pages, so the claim "the loop is fine" rests on fixtures plus per-field diagnosis, not on a completed real application. The verdict should be revisited if, after Phase 4 (key-event adapter) and Phase 3 (re-observation after a form swap) land with fixtures from Ashby, Greenhouse and JazzHR, those same pages still fail for a reason inside `ai-apply.ts`, or if duplicate actions reappear after Phase 5.

Smallest next experiment: Phase 4's adapter on one Ashby fixture and one Greenhouse fixture (saved DOM from the live pages), then one real attempt each. If identity fields stick and the pages confirm, the executor hypothesis holds; if they stick but the loop still cannot finish, that is the first loop-level evidence.

## 9. Next steps (agent's proposal, for the reviewer)

1. **Phase 4 first (executor adapter)**: CDP `Input.insertText` / key events when the native setter does not stick, keyed on the observed `shows()` mismatch; phone national-tail acceptance. Fixtures: Ashby ZOE, Greenhouse Infuse, Workable phone. Accept: identity fields stick on both fixtures and in one real attempt each; `dom-fill.spec` cases; runtime flow with a key-event-only input. Rollback: previous build.
2. **Phase 3 (observation)**: whole-document snapshot ordered dialog → main → rest; all visible forms with cookie/consent banners excluded; question text + required mark for name-labelled controls; re-inspect and re-stage after a form swap; file state from the input. Fixtures: Lever select, Teamtailor banner, BambooHR listing, JazzHR after upload. Accept: Lever's select reaches the model labelled and required; BambooHR's Apply is in the snapshot; JazzHR's staged values survive the swap.
3. **Phase 5 (state, the Option 2 slice)**: per-item journal/session in `storage.local`, heartbeat from the service-worker alarm, stopped items release their slot, identical ask suppressed until the page changes. Accept: runtime "reload mid-run" flow keeps the lease; four stopped items do not block a fifth; `/extension/stops` one entry per (item, reason, page).
4. Small A items alongside: F-GH challenge detection, F7, F13; F8 and F19 need a reproduction first.

Addendum 2026-10-24 01:20 (owner's live run on Lever/Redbee): the page after Submit said "Your application was already submitted … received on October 19, 2026 … 6 months" (Lever's re-application block from the owner's own earlier application) and the loop reported "cannot tell whether this was sent": after Submit it only looked for known confirmation markers. Change: after a dead Submit the page is decided ONCE more; `done` counts as confirmed only when the AI's quoted text is on the page (`onPage`), `skip already_applied` ends the item as already applied (quote also required). Specs: 3 cases in `ai-apply.spec.ts`; suites 222 ext, runtime 20. The same mechanism covers thank-you pages the regex does not know.

---

# Phase 4 Experiment — Generic Input Adapter Proof (2026-10-24, 01:10–02:20)

## Verdict of the experiment

**The input adapter hypothesis is refuted for the two targets.** Measured on the live pages, the engine's existing strategy (native value setter + `input` + `change` + blur, `dom/fill.ts`) updates the framework's own state on both Ashby and Greenhouse. No keyboard/CDP fallback was added; adding one would have been speculative complexity with no failing case to justify it. The failures that looked like "inputs do not accept values" were four other things, each found with evidence and fixed generically, plus one external block that ends the Ashby attempt.

Rebuild decision: unchanged from the Phase 2 exit review; this phase added no evidence of an orchestration or control-flow limit. See section 5 below for the classification of what remained.

## 1. Baseline

Working tree: as in the Phase 2 exit review (no git for the extension). Suites before this phase: backend 371 / 5 skipped, extension 219 / 1 skipped, runtime 20 ok. Fixtures saved from the live pages for later use: `scratchpad/ashby-bjak.html`, `scratchpad/greenhouse-infuse.html` (static DOM; a saved DOM cannot reproduce framework state, so the diagnosis below ran on the live pages).

## 2. Diagnosis on the live pages (root cause per target)

Method: for one control, record the DOM value, React's `__reactProps.value`, React's `_valueTracker` value and `aria-invalid` (a) before, (b) after the engine's strategy (native setter + events + blur), (c) after trusted keyboard typing, (d) after CDP `Input.insertText`, (e) after pressing Submit.

| Page | Control | Engine strategy → React state | Trusted keys → React state | After Submit press |
|---|---|---|---|---|
| Ashby `jobs.ashbyhq.com/bjakcareer/…/application` | `_systemfield_name` (text), `_systemfield_email` | DOM "Test Seeker", React "Test Seeker", tracker consistent, `aria-invalid` null | same | values kept, no `aria-invalid`; the only error text is the static "Fields marked with * are required." |
| Greenhouse `job-boards.greenhouse.io/infuse/jobs/4720910005` | `first_name`, `last_name`, `email` | DOM "Test", React "Test", `aria-invalid="false"` | same | values kept, `aria-invalid="false"` |

Then the engine's own content-script path (`FORM_LIST` → `FORM_INSPECT` → `FORM_FILL` → `FORM_VERIFY`, trusted input off) on the Ashby page: Name, Email, Phone, LinkedIn all `filled` and verified; React state updated. **So the executor primitive works on these pages.** F6 ("Ashby inputs do not take values") and F1b ("Greenhouse identity inputs rejected") were mis-attributed in the Phase 2 review: the stale-aria cascade (F1, fixed) explained Greenhouse; Ashby's symptoms came from the panel path, not the fill.

## 3. What actually blocked the Ashby application, found through the panel path

Run on the owner-authorised posting (`bjakcareer`), 4 attempts, each with the previous root cause fixed:

1. **Resume choice lost (local defect, fixed).** `POST items/:id/resume` wrote `detail.resume_choice` by read-modify-write; state transitions (sent asynchronously from the extension's outbox) also read-modify-write `detail`, so a transition in flight overwrote the choice and `GET items/:id/file` answered "No resume chosen". Reproduced with the extension's own token: the same call succeeded when nothing else was writing. Fix: own column `ApplyBatchItem.resume_choice` (prisma), read with fallback to old rows; spec updated. After the fix the resume uploaded on every attempt.
2. **Required mark drawn by CSS (missing generic capability, fixed).** "Where are you currently based?" is a type-ahead whose label carries class `_required_…` and a star from `::after`; no `required`, no `aria-required`, no star in the text. The inspector reported it optional, the model skipped it, Ashby refused silently. Fix: `cssRequired` in `dom/inspect.ts` (label class/data attribute saying "required", or a star in the label's `::after` content). Fixture + spec. After the fix the model answered "Cairo, Egypt" and the type-ahead picked it.
3. **Captcha after Submit (external; detection fixed).** Pressing Submit raised a reCAPTCHA Enterprise image challenge. `page-state.ts` matched only `recaptcha/api2/bframe`; now `recaptcha/(api2|enterprise)/bframe`. `afterSubmit` reports it and the loop stops with "solve it on the page" instead of `unconfirmed`. Spec added.
4. **Refusal text after Submit (honest reporting, fixed).** Ashby's final answer: "We couldn't submit your application. Your application submission was flagged as possible spam." The loop now returns `needs-user` quoting the page when a dead Submit shows a refusal alert and no field error. Spec added.
5. **Name emptied after the resume upload (observed; partly fixed).** On every attempt after the first, `Name` ended empty while Email and Phone kept their values. The journal now records it as "Did not stick: Name (not filled)" and, after this phase, a target that gets no read-back is failed as `no-result` instead of staying pending. The mechanism (Ashby's "Autofill from resume" re-mounting the Name input after parsing, so the staged value pointed at a replaced element) is the F14/F18 class; re-staging by label was added for the swap case, but on Ashby the replacement happens during the same fill round, before any reinspection. Open: a second write for rows whose element was replaced mid-round. Evidence level: medium.

Journal of the last attempt (02:01 build): 11 fields read, 11 answered; filled Email, Phone, location "Cairo, Egypt", LinkedIn, GitHub, consent, three radios; Name did not stick; Submit pressed once; page refused as spam; no second press; item VERIFY → settled by the operator as not submitted.

## 4. Files changed in this phase

`plato-native-be/prisma/schema/job.prisma` (`resume_choice` column), `src/modules/extension/resume-file.service.ts`, `batch.service.ts` (read fallback), `resume-file.service.spec.ts`. Extension: `src/dom/inspect.ts` (`cssRequired`), `src/dom/page-state.ts` (enterprise bframe), `src/panel/ai-apply.ts` (`afterSubmit` captcha/refused), `src/panel/main.ts` (captcha/refused in `afterSubmit`, re-staging by label, journal lines "Held back", "Fill error", split fill report, resume-save failure), `src/core/form-review.ts` (`no-result`), fixtures `errors.html`, specs in `dom-inspect.spec.ts`, `ai-apply.spec.ts`.

## 5. Classification of what remains (Phase 4 scope)

| Failure | Class | Evidence | Smallest fix |
|---|---|---|---|
| Ashby refuses the submission as spam | External limitation | page text after Submit; reCAPTCHA Enterprise frames present | none in the engine; the seeker submits by hand after the challenge. A real profile and a human-paced session may score differently: untested |
| Name element replaced mid-round by Ashby's resume autofill | Observation after page transition (missing generic capability) | journal "Did not stick: Name (not filled)" on attempts 2–4; DOM shows Name empty while siblings keep values | after a fill round, re-inspect and re-write rows whose fingerprint survived but whose element changed; bounded to one extra write |
| Lever location select unlabelled / not required | Observation | unchanged since Phase 2 | Phase 3 label fallback; `cssRequired` may already cover Lever's star (untested) |
| JazzHR form replaced after resume upload (7 values lost) | Observation after transition | journal | same as Name above |
| Adopt path after a browser restart shows legacy rows while the server item is PENDING | State/resume (F10) | reproduced 3× in this phase; blocked every retry until a fresh batch | Phase 5 durable state |

No failure in this phase was in the decision, the guard, the press, or the loop's recovery order.

## 6. Live evaluation in this phase

| Attempts | Confirmed | Submit pressed | Pressed twice | Outcome |
|---|---|---|---|---|
| Ashby Bjak ×4 (authorised dummy application) | 0 / 4 | 3 | 0 | 1 stopped on resume (fixed), 1 stopped on the required location (fixed), 2 refused by the site's spam filter after a full fill |

Fixtures: runtime harness 20 ok, with flow F (submit refused, repaired, confirmed) unchanged.

Suites at the end of this phase (run 2026-10-24 02:25): backend `npx jest` 371 passed, 5 skipped; extension `npx vitest run` 225 passed, 1 skipped (22 files); runtime `npm run test:runtime` 20 ok. Production build rebuilt; reload the extension to get build 02:2x.

## 7. Smallest next experiment

Re-write rows whose element was replaced during the fill round (one bounded re-inspect + write), then run the same Ashby page once more with the owner solving the captcha by hand; if the page then confirms, the Ashby class is closed. In parallel, one Lever attempt to see whether `cssRequired` makes its location select required.

---

# Engine v2 frozen (2026-10-24)

Owner decision: the current engine (inspect → one AI decision → fill → verify → repair → press, `panel/ai-apply.ts` + `apply/page-decide.agent.ts`) is closed as **engine v2**. Final state: backend 371 passed / 5 skipped; extension 232 passed / 1 skipped; runtime 20/20. Real pages: 0 confirmed applications in 26 attempts; furthest stage reached = form filled and Submit pressed once with a stop at the site's human check (Ashby, Lever) or a site refusal (Ashby spam filter). Last fixes in v2 (uncommitted to a live run): stale "is required" messages before Submit are not rejections (`blockingError`), fill re-applies to an element the page replaced mid-round, the honeypot off-screen check uses page coordinates (it dropped First Name on scrolled pages), question text from the field's own box (`boxLabel`), CSS-drawn required marks (`cssRequired`).

Next: engine v3 evaluation built on Anthropic's browser use tool (`browser_toolset_20260801`, client-side toolset; the extension would be the driver). See the chat summary of 2026-10-24 and the memory file for the proposed spike.

---

# v3 Phase 0 — browser use tool spike (2026-10-24 12:40–13:00)

Code: `plato-native-be/scripts/v3-spike/` (`cdp-browser.ts` driver = Anthropic's quickstart CDP example extended with form_input, type, key, scroll, find, screenshot, zoom, file_upload; `spike.ts` runner with the dummy profile, a Submit gate in `confirm` that refuses any click on a submit control, and per-run metrics). Model `claude-sonnet-5-5`, prompt caching on the system block and the toolset. Nothing was submitted anywhere (gate held: 0 fixture POSTs, every real page ended before Submit).

| Target | Stage | Turns | Time | Cost | Proof |
|---|---|---|---|---|---|
| fixture `form.html` | SUBMIT_READY | 4 | 22 s | $0.03 | all fields incl. the City revealed after Country, resume uploaded, honeypot + password left empty |
| fixture `stepper.html` (3-step dialog, phone pattern) | SUBMIT_READY | 12 | 35 s | $0.13 | reached the review step; the pattern rejection was read from `validationMessage` and the "+" dropped |
| fixture `rejects.html` (required select, star outside label) | SUBMIT_READY | 4 | 16 s | $0.02 | location "Bogota" picked by the job-location rule |
| Meridial, Greenhouse EU | SUBMIT_READY | 13 | 77 s | $0.30 | final tree: Country +20, Location "Cairo, Egypt", School, Degree, Discipline, years, residence "Egypt", US-state "I am not located in the USA currently", LinkedIn, consent — every required field holds a value |
| Lever, Redbee | SUBMIT_READY | 8 | 40 s | $0.10 | location select "Bogota", identity, links, two Spanish questions answered in Spanish, resume attached |
| Ashby, Bjak | SUBMIT_READY | 7 | 57 s | $0.08 | Name/Email/Phone, location type-ahead "Cairo, Cairo, Egypt" picked from the list, resume, links, consent checked, screening radios from the work history |

Compare v2 on the same pages: Meridial stopped with 7 required fields empty across 3 attempts; Lever never filled the location select in 6 attempts; Ashby lost Name on 3 of 5 attempts and never passed the location. v3 cleared all three in one run each, with no site-specific code.

What the spike taught (goes into Phase 1/2 as-is):
- Driver: `chosenText` for widgets that clear their text box after a pick (react-select and friends), `DOM.setFileInputFiles` for the resume, native `validationMessage` exposed as `error=` in `read_page`, the Submit gate decided on the element (type=submit in a form, or text "Submit/Send application"), never on "Apply/Next/Continue".
- Prompt rules that changed outcomes: read the tree before screenshots; verify `value=` on every required field before stopping; a job-location question is answered with the posting's location; screening questions from the work history; a required consent box for the application is checked; facts not in the profile → ask.
- Iterations: first runs asked about the consent box and screening radios (Ashby) and refused "Apply now" as a submit (stepper); both were rule/gate fixes, not model limits.
- Cost: $0.02–$0.30 per application on Sonnet with caching (cache reads 60–90% of input). Latency 16–77 s. Toolset + system ≈ 6.6k + 1.5k tokens cached.
- Transient: one API "Connection error" (network) on Ashby; the SDK's retries did not cover it, the rerun passed. Phase 1 needs a resume-from-conversation on such errors.

Go/no-go: **go** (criterion was ≥ 2 of 3 real pages + all fixtures at SUBMIT_READY; result 3 of 3 + 3 of 3). Next: Phase 1, the backend brain (`extension/v3/`), then Phase 2, the extension executor over `chrome.debugger`.

---

# v3 Phase 1 — backend brain through the HTTP endpoint (2026-10-24 16:00–16:20)

`POST /extension/v1/items/:id/v3/turn` driven by `scripts/v3-spike/remote-exercise.ts` (the extension's role played by the spike's CDP driver: pair → batch → claim → PREPARING → FILLING → turn loop → release). Model `claude-sonnet-5-5`. Submit gated in the driver (nothing sent); items released at the end.

| Target | Outcome | Turns | Time | Final tree (required fields) |
|---|---|---|---|---|
| Meridial, Greenhouse EU (6acd6ce1135be47e3bbf0b89) | SUBMIT_READY | 15 | 99 s | First/Last/Email, Country +20, Phone, Location "Cairo, Egypt", School, Degree, Discipline, Start/End year 2016/2020, residence Egypt, US-state "not located in the USA", LinkedIn, consent checked |
| Lever, Redbee (6ac97b024b2bcd62b3ced082) | SUBMIT_READY | 10 | 62 s | location Bogota, resume, name/email/phone, "Cairo, EGY", contractor question "Yes", salary expectation |
| Ashby, Bjak (6adbddebf4a2225672ce155a, added via jobs/by-url) | SUBMIT_READY | 11 | 51 s | Name/Email/Phone, "Cairo, Egypt" type-ahead, resume, consent checked, visa "No", three screening answers |

Found and fixed on the way: education years missing from the profile summary (the model asked) → `start`/`end` years in `profile-summary.ts`; Nest's 100 kB JSON limit refused a screenshot result (413) → 12 MB; the device cap (5) hit by one new pairing per run → the script keeps its token and revokes its own stale devices; Meridial's first `read_page` refs went stale after hydration (one wasted turn; the model recovered with a second read).

# v3 Phase 2 — extension executor (2026-10-24 16:20–16:50)

Built as planned (see V3_PLAN § Phase 2). Harness results: `npm run test:runtime:v3` 5/5 (flow A through v3, Submit gate, no third-party requests); `npx vitest run` 25 files all green (v3 specs: run 11, executor 11, reader 10); `npm run test:runtime` (v2 fixtures build) 20/20 still green; production build `dist/production` on engine v3. One real defect caught by the harness: the page guard window from an earlier guarded click was still open when the allowed Submit press landed and cancelled it → the guard is now disarmed as soon as it is read. Next: Phase 3, the same three pages through the real panel in the owner's Chrome.
