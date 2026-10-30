# Plato Apply extension: product analysis and UX redesign spec (2026-10-29)

Scope: the Chrome extension in `plato-extension/` only. Read-only discovery of the tree at `claude/keen-shannon-uejfb4` (a70400c + uncommitted v3 fixes). Unit suite: 282 passed, 1 skipped.

Legend: **[V]** verified by reading or running code. **[A]** assumption. **[?]** open question.

---

## 1. Product overview and personas

**What it is [V].** An MV3 side-panel extension ("Plato Apply") that applies to jobs *in the seeker's own browser*. The seeker picks jobs (on the Plato web app or in the panel), the panel opens each job in a tab in a "Plato" tab group, and an AI engine (v3: backend-hosted Claude browser-use loop, the panel executes each browser action) fills the form, uploads the resume, and presses Submit once. The seeker is pulled in only for a login, captcha, or a fact only they know.

**Persona [V, from copy and data model].** A job seeker with a Plato profile, resume and saved searches (`DiscoveryRun`), applying to many ATS-hosted roles (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Recruitee, Teamtailor, Personio, JazzHR; LinkedIn/Indeed/Wuzzuf listings route to those). Comfortable leaving a browser running. Wants volume with control: see what was sent, step in rarely.

**Secondary actor [V].** The owner/operator running live tests (`docs/V3_LIVE_TEST_2026-10-27.md`): needs the activity log, build stamp, trace. Not the target of the redesign, but the log must survive.

## 2. Current user journeys [V]

1. **Pair.** Web app → Extension page → "Generate code" → paste in panel → `POST /extension/pairing/exchange` → token in `chrome.storage.local` (TRUSTED_CONTEXTS). Welcome screen.
2. **Pick jobs.** Either (a) "Apply with Plato" on the web → items arrive as `PENDING` with `batch_id`; or (b) wizard in the panel: Search → Jobs (server-filtered, paged 6/page, cap 50) → Consent ("Allow Plato to open tabs?") → `POST /extension/v1/apply-batches` → `consent` audit → run.
3. **Run.** `runQueue()` opens up to `settings.tabs` (2/4/8, max 10) jobs at once from `state.runIds`; each: `claim` → tab → `prepare` → `runV3Item` loop → outcome (`confirmed` / `ready` / `unconfirmed` / `skip` / `needs-user`).
4. **Step in.** Needs-you items show a ticket; the chat (orchestrator agent) asks the question; the answer re-runs the job with `seeker_answer`. Captcha: solve on page, "Try again" sends `solved`.
5. **Settle.** `AWAITING_SUBMIT` ("Submit for me" / "I submitted it" / "Not sure"), `VERIFY` ("I submitted it" / "I did not"). Terminal: `SUBMITTED_CONFIRMED`, `SUBMITTED_ATTESTED`, `FAILED`, `SKIPPED`, `CANCELLED`.
6. **Recover.** Panel reload: `resumeOrphans()` reattaches jobs whose tab is alive; lease sweep on the server returns lost pre-armed items to `PENDING`, armed ones to `VERIFY`.

## 3. Screen inventory (current) [V]

| Screen | File | Responsibility |
|---|---|---|
| Loading | `view.ts` | "Loading…" |
| Unpaired | `view.ts` | code + label inputs, 3 steps, Link |
| Welcome | `wizard.ts` | success ring, waiting count, sites, how it works |
| Wizard: Search | `wizard.ts` | 2×2 search cards, paged dots, selected summary |
| Wizard: Jobs | `wizard.ts` | search box, 5 dropdown filters, Select-all-matching, From-Plato chip, 6 rows/page, picks across pages |
| Wizard: Consent | `wizard.ts` | N jobs, tabs at a time, rounds, resume mode, Allow / Decline (reason required) |
| Queue (home) | `view.ts` | header + ⋮ menu, Ready card (count, match range, resume, cover letter toggle, speed), "older waiting jobs" note, groups Needs you / In progress / Waiting (per-batch blocks with Remove), item cards per state, Activity log, Clear-queue confirm |
| Chat dock | `assistant.ts` | pinned bottom; greeting + suggestions, messages, ask chips, composer, hints |
| Item card (per state) | `view.ts renderItem` | PENDING Start; CLAIMED…REVIEW progress/needs-you/resume choice/cancel; AWAITING_SUBMIT 4 buttons; VERIFY 2 buttons; ticket (Open ticket in chat, Try again) |
| Form review (v2 only) | `view.ts renderFormReview` | per-field Use/Skip; dead in v3 production (`__ENGINE__='v3'` never sets `formReviews`) |
| On-page overlay | `content/overlay.ts` | purple frame, pill with Stop, gliding cursor, amber "needs you" |

## 4. Business rules and functional contracts [V]

- **State machine** `core/extension-contract.json` (pinned by tests, identical to backend). Only the extension moves items; `CLAIMED` only via `/claim`; `AWAITING_SUBMIT` has no way back (only evidence or the person settles it).
- **Lease 90 s, heartbeat 20 s.** 409 on heartbeat = lost hold → session dropped, item returns to queue.
- **One Submit press per item**, ever. Arm on the server (`AWAITING_SUBMIT`, must-ack) *before* the press. `CONFIRMED` only when the quoted text is really on the page (`onPage`). Nothing is ever re-sent.
- **Policy gate:** provider must be `FILL_ONLY` both locally and on the server; unknown policy = everything blocked. Checked before `claim`.
- **Batch creation (server):** 1–50 unique ids; rejects `unknown_job`, `no_provider`, `provider_blocked`, `duplicate` (live item exists or application not in FAILED/SKIPPED/EXPIRED). Batch named after the search. Web "queued" flag spent on creation.
- **Concurrency today:** `tabLimit() = min(settings.tabs, 10)`; sliding window (a slot frees as a session ends); `runIds` scopes the runner to the current run; `launching` flag + `tried` set prevent double-starts.
- **One panel instance runs the queue:** `panelLock` in `chrome.storage.session`, 8 s lease, renewed every 3 s, released on `pagehide`.
- **Outbox:** un-acked terminal transitions replay in order with the same `(attempt_id, seq)`; 409 = reconcile; 401/403 = stop.
- **Token** never leaves the panel/SW; content scripts carry no token; CSP `connect-src` = one API origin; no host permissions (content scripts statically matched to FILL_ONLY provider patterns).
- **Consent audit:** every run posts `consent {decision, jobs, tabs, auto_submit}`; decline requires a reason ≥ 3 chars.
- **Auto-submit is always on in production** (owner rule 2026-10-21); `--submit=off` build only for live tests. Chat "submit" or the "Submit for me" button overrides per job.
- **Resume:** `resumeMode` profile|tailored; choice saved on the item *before* the file is fetched.
- **Journal** per item (session storage, 60 lines), sent with every turn; trace for timings.

## 5. Separation of concerns [V]

| Layer | Where | Notes |
|---|---|---|
| UI (pure render) | `panel/view.ts`, `wizard.ts`, `ready.ts`, `assistant.ts`, `dropdown.ts`, `icons.ts`, `panel.css` | `h()` DOM builder, textContent only. Full re-render on every `draw()`; chat cursor and open dropdown preserved by hand. |
| App/controller | `panel/main.ts` (1302 lines) | State object, actions, runner, wizard steps, resume/orphans, chat events, journal, trusted input, boot. **The domain layer lives here too.** |
| Domain | `core/orchestrator.ts`, `core/reconcile.ts`, `v3/run.ts`, `v3/executor.ts` | Pure, injected, well tested. |
| Services | `core/api.ts`, `core/outbox.ts`, `core/token-store.ts` | One network path. |
| Infrastructure | `background.ts`, `manifest.ts`, `content/*`, `providers/*`, `scripts/build.mjs` | Chrome APIs, CSP, tab group, debugger. |

**Architectural constraint:** the "batch runner" (which items run, how many, when the run ends) is ~120 lines inside `main.ts` (`runQueue`, `startItem`, `startAll`, `wizardStep('allow')`, `resumeOrphans`, session `run` record) with no module boundary and no unit test (`batches.spec.ts` only covers `latestBatch`). Any batch-level invariant must be extracted to be enforceable and testable.

## 6. UX problems and friction [V unless marked]

1. **Two models of "a batch" fight each other.** The server batch (`batch_id`, up to 50) vs the run (`runIds`, speed-limited window). The Ready card shows only the newest server batch; "older waiting jobs" are a footnote; per-row **Start** drains the whole queue (F1 in the live-test doc). The seeker has no single answer to "what is running and what is it running on".
2. **No concept of batch progress or completion.** Items are grouped by state (Needs you / In progress / Waiting). Submitted, failed and skipped items disappear from the list (`api.batches()` returns only items needing attention [A: inferred from `list()` doc comment "Items that still need attention"]). There is no summary, no ETA, no "done".
3. **Selection has no cap feedback.** Picks silently truncate at 50 (`slice(0, MAX_JOBS)`); the count sits far from the checkboxes; "Select all N matching" jumps to the cap without saying so.
4. **Consent screen is an interruption, not a confirmation.** It asks "Allow Plato to open tabs?" and offers Decline with a mandatory essay. It does not list the jobs, cannot remove one, and the resume setting is buried in a row.
5. **Chat is the error channel.** Blocked jobs become chat tickets; the question appears both on the card and in the dock; the dock takes up to 34vh permanently. F8: the chat answers stop notices on its own.
6. **Copy explains the system, not the outcome.** "Plato is filling this form. It submits only if you allowed it; otherwise, or if it cannot, you press Submit." Four buttons on `AWAITING_SUBMIT`. State names leak (`page_closed`).
7. **Dead UI in production:** form review (v2), "The form is ready — I will submit it myself" (never reached in v3), "Customize before applying" re-enters the whole wizard.
8. **Overflow menu holds first-class actions** (New batch, Clear queue, Activity log).
9. **Header real estate:** build stamp in the brand line for every user.
10. **Interrupted runs are explained in system terms:** "This was started in an earlier session and is not open here." Resume lives in a chat event and a per-card button.
11. **Visual:** v1 and v2 CSS layered (two `.item`, two `.welcome` blocks); letter avatars tinted by hash; mixed radii (8/12/14/16); 13.5/12.5px sizes.

## 7. Proposed information architecture

Two top-level views and one sheet. The chat becomes contextual (opened from a job), not a permanent dock.

```
Panel
├─ Header: mark · "Plato Apply" · connection dot · overflow (Activity log, Settings, Unlink)
├─ Segmented nav: Jobs | Batch (badge: running / needs you / done)
├─ View: Jobs
│   ├─ Search picker (current search, count, From-Plato count)
│   ├─ Filter row (search box, Best match ▾, Remote ▾, From Plato chip)
│   ├─ Job list (select, up to 10; not-available rows explain why)
│   └─ Batch dock (sticky bottom): "3 of 10 selected · Review batch →"
│        └─ Batch review sheet: jobs with remove, resume setting, the three facts, Start / Keep editing
├─ View: Batch
│   ├─ Active:   header card (10-cell strip, counts, ETA, Stop batch) + job rows by status
│   ├─ Needs you: inline question card on the row (chips + answer) / Open tab / Try again
│   ├─ Interrupted banner: Resume / Release
│   ├─ Finished: summary card (outcomes, duration, strip) + rows + "Start a new batch"
│   └─ Empty: "No batch yet" → go to Jobs
└─ Link (unpaired): code + name, 3 steps, Link
```

Why: the seeker's two questions are "what will I send" (Jobs) and "what happened" (Batch). The dock keeps the selection count and the cap in view at all times, and morphs into the progress bar while a batch runs, so the one-batch rule is visible instead of modal.

## 8. Component system and tokens

Tokens come from `panel.css` / web `.theme-app` (unchanged brand): primary `#4f3ff7`, hover `#4335dd`, soft `#efedfe`, tint `#fbfaff`, fg `#1e1d2b`, fg-2 `#55536b`, muted `#8b899e`, line `#e7e6f0`, bg `#f7f7fb`, success `#1c9a4b`/`#e3f9ea`, info `#2d6fe0`/`#e7f0fe`, warning `#d97706`/`#fef3c7`, error `#f04438`/`#fee4e2`. Font: Plus Jakarta Sans (system stack fallback: CSP forbids web fonts in the panel; the web app loads it via next/font, the extension inherits only if installed [V]). Mark: the "P" tile, radius 28% of size (`plato-orb.tsx`). Light only (web app is light-only [V]).

Scale: space 4/8/12/16/20/24; radius 10 (controls) / 14 (cards) / 18 (sheet); type 11 eyebrow, 12 meta, 13 body-sm, 14 body, 16 title, 24/32 display (tabular).

Components: `Header`, `SegmentedNav`, `SearchPicker`, `FilterRow`, `JobRow` (selectable | status), `StatusPill` (queued, running, needs-you, submitted, failed, skipped, cancelled, interrupted, verify), `BatchDock`, `BatchSheet`, `BatchStrip` (10 cells), `BatchHeader`, `QuestionCard`, `Banner` (info/warn/error/offline), `Toast`, `EmptyState`, `Skeleton`, `ConfirmInline` (stop batch), `Menu`.

## 9. New batch workflow: rules, enforcement, states (Phase 3)

### 9.1 Rules
- One active batch per seeker-device; up to 10 jobs; explicit review before start; add/remove before start; count and cap always visible; progress, per-job outcome, ETA when reliable; distinct pending/running/succeeded/failed/cancelled/interrupted; enforcement in the execution layer.

### 9.2 Where enforcement must live [proposal, grounded in §4–5]
1. **Extension execution layer (new module `core/batch-runner.ts`, pure, injected, tested):**
   - `BatchRun = { id, itemIds[≤10], startedAt, status: 'running'|'stopping'|'finished'|'interrupted' }` persisted in `chrome.storage.session` (survives panel reload, not browser restart) and mirrored in memory.
   - `start(items)` throws `BatchError('active')` if a run exists whose status is not `finished`; throws `BatchError('cap')` above 10. The wizard/sheet only *calls* it; disabled buttons are cosmetic.
   - Slot window stays (`settings.tabs`), but scoped to the run's ids only. Per-row Start is removed (fixes F1).
   - `finish` when every id is terminal or `VERIFY`/`AWAITING_SUBMIT` settled by the person [? see 9.5].
2. **Cross-view / cross-panel:** `panelLock` already makes one panel the runner. The run record in session storage is the shared truth; a second panel renders read-only ("Plato is open in another panel").
3. **Server:** `createBatch` already caps at 50 and dedupes live items. Proposed: cap lowered to 10 for extension-created batches and a server check "no other batch with live items for this seeker" returning 409 `batch_active` [? backend change, out of extension scope; the extension enforces regardless].
4. **Background events:** none run the batch (SW is intentionally empty); nothing to change.

### 9.3 Interrupted execution
- Panel closed/reloaded mid-run: run record + `tab:<id>` keys survive in session storage → batch view shows **Interrupted** banner with Resume (reattach live tabs via `resumeOrphans`) / Release. Items whose tab died are marked `interrupted` in the row until released.
- Browser restart: session storage is gone; server lease sweep returns pre-armed items to `PENDING` and armed to `VERIFY`. The batch view rebuilds from `api.batches()` grouped by `batch_id`: shows "Batch interrupted by a browser restart" with the same two actions. (Today F4 shows "Please check / page_closed".)
- Lost lease (409 heartbeat): row → `interrupted` with "Another browser took this job" or "Plato lost its hold"; batch continues with the rest.
- Offline: outbox count surfaces as a banner on the batch view; rows keep last known state; ETA pauses.

### 9.4 Retries
- Per job "Try again" keeps the same item (same `attempt_id` when the session is alive; otherwise re-claim). A retry never counts as a new batch. Failed items stay in the finished summary; "Retry failed (n)" on the summary creates a **new** batch from those job ids (server rejects duplicates for non-retryable statuses [V]).

### 9.5 Ambiguities and proposed resolutions
| # | Question | Proposal |
|---|---|---|
| Q1 | Does a batch "finish" while a job sits in `VERIFY` or `AWAITING_SUBMIT`? | Batch shows **Finished, 1 needs your answer**; the next batch is allowed once nothing is `running`/`needs-you` with a live tab. VERIFY does not block a new batch (it is the person's word, any time). |
| Q2 | Jobs added from the web app while a batch runs | They land in Jobs as "From Plato", pre-selected for the *next* batch; never auto-run. |
| Q3 | Second linked browser | Already blocked by server leases per item; the extension shows the other browser's items as "Running elsewhere" inside the batch and does not count them in its own slot window. |
| Q4 | ETA formula | Median duration of finished jobs in this batch × remaining ÷ min(slots, remaining); shown only after ≥ 1 finished job and labelled "based on N finished". Before that: "Estimate after the first job finishes". |
| Q5 | Cap 10 vs server 50 and `MAX_TABS` 10 | Extension cap 10 (new `MAX_BATCH_JOBS`); `MAX_TABS` unchanged; speed setting still limits open tabs. |
| Q6 | Decline + reason | Kept as the server audit (`consent decline`) but moved to a quiet "Why not?" link on the sheet, optional in the UI [? owner: is the mandatory reason a product requirement?]. |
| Q7 | Older waiting jobs from earlier picks | Shown in Jobs under "Queued earlier", selectable into a batch, with a one-tap "Remove all". |
| Q8 | Chat | Kept as a contextual drawer opened from a job's question or from the overflow; not a permanent dock. The orchestrator API is unchanged. |

### 9.6 Per-job states (UI vocabulary → server states)
| UI | Server | Notes |
|---|---|---|
| Queued | PENDING (in run) | |
| Running | CLAIMED, PREPARING, FILLING, REVIEW, AWAITING_SUBMIT (auto) | step line from the journal's last line |
| Needs you | NEEDS_USER, session needs-user, AWAITING_SUBMIT (submit failed) | question card inline |
| Please check | VERIFY | I submitted / I did not |
| Submitted | SUBMITTED_CONFIRMED / ATTESTED | attested shows "you confirmed" |
| Failed | FAILED | reason in words |
| Skipped | SKIPPED | closed / already applied |
| Cancelled | CANCELLED | by the person or Stop batch |
| Interrupted | live state with no session and no live tab; lost lease | Resume / Release |

## 10. Testing strategy and acceptance criteria

Unit (vitest, existing style): `batch-runner.spec.ts` (start refused while active; cap 10; finish conditions; interrupted detection; ETA function), `view.spec.ts` additions (dock count/cap, sheet lists jobs and explains the rules, status pills per state, no button acts as automatic Submit), `wizard`→`jobs.spec.ts` (11th selection refused with message; select-all stops at 10 and says so). Runtime (`test/runtime/v3.mjs`): one batch of 3 through fixtures, second start refused, reload mid-run → Resume reattaches. Acceptance: every requirement in §9.1 has a test; no production button submits; the orchestrator/outbox/reconcile contracts unchanged (their suites stay green).

## 11. Open questions for the owner
- Q6 mandatory decline reason; Q1 finish semantics with VERIFY; server-side `batch_active` 409 (backend change); whether the build stamp stays visible to seekers; whether the 2/4/8 speed setting stays user-facing or becomes "Plato decides".
**What it is [V].** An MV3 side-panel extension ("Plato Apply") that applies to jobs *in the seeker's own browser*. The seeker picks jobs (on the Plato web app or in the panel), the panel opens each job in a tab in a "Plato" tab group, and an AI engine (v3: backend-hosted Claude browser-use loop, the panel executes each browser action) fills the form, uploads the resume, and presses Submit once. The seeker is pulled in only for a login, captcha, or a fact only they know.

---

## 12. Implementation (Phase 7, 2026-10-29)

Prototype approved by the owner ("ok start apply it"); the panel was rebuilt on the approved design. Engine code (v2 `runAi`, v3 `runV3Item`, orchestrator, outbox, reconcile, executor, reader, providers, manifest, CSP) is untouched.

**New**
- `src/core/batch-runner.ts`: the batch (one at a time, `MAX_BATCH_JOBS = 10`), guards in `start()` (`BatchError`: active / cap / empty / dup), `adopt()` for a browser restart, per-item `markStarted` / `record` outcomes (the server lists only open items, so terminal outcomes are kept here), `rows()` / `settle()` (server list + this panel's sessions → one status per row; VERIFY does not hold the batch open, Q1), `eta()` (median of this batch's finished runs, over what is left, `slots` at a time; `'first'` before the first finished job, Q4), `pickToggle()` (the 11th pick is refused, never truncated). Record persisted in `chrome.storage.session`.
- `src/panel/jobs-view.ts`: Jobs view (queued-on-Plato section, search picker, filters, rows, "Select N on this page"), the dock (count vs cap, or the running batch's progress), the batch review sheet (the only control that starts a batch).
- `src/panel/batch-view.ts`: Batch view (10-cell strip, counts, estimate, Stop batch with inline confirm; rows with one pill per status: queued, running, needs you, please check, interrupted, elsewhere, submitted, failed, skipped, cancelled, settled elsewhere; inline question card, human-check card, resume choice, the armed job's own buttons; finished summary with Start a new batch / Retry failed).
- `test/batch-runner.spec.ts` (guards, statuses, settle, eta, adopt, persistence); `test/view.spec.ts` rewritten for the new screens (text never HTML, blocked providers, cap and dock, sheet, locked Jobs view, every status, inline answer, VERIFY, interrupted, human check, estimate, summary, empty states).

**Replaced / removed**: `wizard.ts`, `ready.ts`, `dropdown.ts`, `wizard.spec.ts` (deleted); `view.ts` (shell, header, nav, link screen, menu, log, chat drawer, toasts); `panel.css` (rewritten from the prototype's tokens); `main.ts` (wizard, Ready card, `startAll`, `runIds`/`running`, Clear queue, `watchBlocked` auto-consult removed; batch actions, jobs actions, toasts, progress line, `cancelSession` closes the job's tab, outcomes recorded at every terminal move including reconcile's confirmations).

**Behaviour changes to know**
- Per-row Start is gone (F1): a batch starts only from the sheet; the runner opens the batch's jobs `settings.tabs` at a time.
- Plato's question is answered on the job's row (goes straight to that job as `seeker_answer`); the orchestrator chat is a drawer opened from the menu or "Ask Plato" on a row, no longer polled automatically (F8).
- "Cancel this job" / "Stop batch" cancel the server item and close its tab, so a loop never keeps driving a cancelled page. An armed job (AWAITING_SUBMIT) is never cancelled (contract): the person settles it.
- Interrupted jobs: a reloaded panel reattaches live tabs by itself (as before); rows it cannot reattach show "Interrupted" with Resume / Release (differs from the prototype, which showed a banner before resuming).
- Decline-with-reason is not in the UI (Q6); `POST /consent` still logs every start with `decision: allow`.
- Auto-submit stays production-on (`__AUTO_SUBMIT__`); the sheet's wording follows the build (`autoSubmitPreview`).

**Verified**: `npm run typecheck`, `npm run lint`, `npm test` (291 passed, 1 skipped, bundle guards included: no innerHTML in the panel), `npm run build`, `npm run test:runtime:v3` 11/11 in a real Chromium (one batch of five: fill, Submit gate, reload mid-batch → VERIFY, captcha resume, inline answer resume, one-Submit, summary, new batch), `npm run test:runtime` (v2, frozen engine): see the run log in the session notes.

**Not done / open**: server-side `batch_active` 409 and a cap of 10 on `createBatch` (backend); a "Queued earlier" bulk remove; the activity log and settings as sheets (log is a card, settings only the resume mode on the sheet; speed stays the server's setting); the Plus Jakarta Sans face in the panel (CSP: system stack).
