# Extension fix plan (2026-10-19)

From a live test: job picked on Plato → extension → Greenhouse job
`job-boards.greenhouse.io/utt/jobs/4448389009`. Work one step at a time; tick a
step only when its "Done when" is checked in the real browser.

## What we found

| # | Problem | Evidence | Where |
|---|---|---|---|
| A | Name, email, phone and the "years" answers are never written into the Greenhouse form | Backend sends them ([candidate.service.ts:52](../plato-native-be/src/modules/extension/candidate.service.ts#L52)). The mapper matches First/Last Name, Email and Phone on the real page (checked in a jsdom run). In the chat, these fields are missing from the "pending" list, so they were tried and **failed** | [dom/fill.ts](src/dom/fill.ts), [core/form-review.ts](src/core/form-review.ts) |
| B | The chat can't fill a failed field ("I could not find First Name") | It only searches rows with `status === 'pending'` | [panel/main.ts:617](src/panel/main.ts#L617) |
| C | The ticket says "Still needed: First Name…" without the reason | `settle()` lists labels only, not why the fill failed | [panel/main.ts:373](src/panel/main.ts#L373) |
| D | Custom questions ("how many years…") depend on the AI, which times out on a slow network | Profile already has `yearsExperience`, skills and experiences | `aiAnswer` in [panel/main.ts:356](src/panel/main.ts#L356) |
| E | The search picker opens on the starred search (6 days old), not the search that holds the picked job | Starred first, then newest | [searches.service.ts:74](../plato-native-be/src/modules/extension/searches.service.ts#L74), `openWizard` in [panel/main.ts](src/panel/main.ts) |
| F | Job list: no platform logo, no match %, weak "Added from Plato" tag, no filter for it | The server already sends `source`, `match` and `queued` | `SearchJob` in [core/types.ts:81](src/core/types.ts#L81), [panel/wizard.ts](src/panel/wizard.ts) |
| G | The panel contradicts itself: "Applying to 1 job" + "Nothing queued" + "I'm applying now" | Three separate status sources | [panel/view.ts](src/panel/view.ts) |
| H | The AI asks "please choose one" for a free-text field | Wording of the ask prompt | orchestrator agent (backend) |

## Steps

### 1. Fill works on Greenhouse (A, B, C)
- [x] Real Greenhouse form saved as a fixture (`test/fixtures/dom/greenhouse-utt.html`).
- [x] Each failure reason shown on the ticket, e.g. "Phone (the page changed it)".
- [x] Cause confirmed in headless Chrome: about 8 s after load Greenhouse replaces the `<form>` and every input with new elements. Ids are now carried over by HTML `id`/`name`, so the old ids still point to the right fields ([dom/inspect.ts](src/dom/inspect.ts)).
- [x] Phone: the page reformats `+201001234567` to `+20 10 01234567`. Same digits are now accepted ([dom/fill.ts](src/dom/fill.ts)).
- [x] The chat can refill failed or stale rows ([core/form-review.ts](src/core/form-review.ts), [panel/main.ts](src/panel/main.ts)).
- [ ] Owner checks it in the browser.
- **Done when:** on this job, First Name, Last Name, Email, Phone and Country fill by themselves, and a test using the fixture covers it.

### 2. Answer questions from the profile first (D, H)
- [x] "How many years…" answered from the profile before the AI: years since the first job, else the low end of the onboarding range. A question naming tools needs one of them in the seeker's skills (`yearsAnswer` in [answers.service.ts](../plato-native-be/src/modules/extension/answers.service.ts)).
- [x] If the AI call fails, the profile answers still return (`aiFailed: true`) and the ticket says "(AI not reachable)".
- [x] Ask tool: "choose" only when the field has options ([apply-orchestrator.agent.ts](../plato-native-be/src/modules/apply/apply-orchestrator.agent.ts)).
- **Done when:** this job's years questions fill with the AI switched off.

### 3. Search picker (E)
- [x] Searches with jobs added from Plato come first, then newest. Cards show "N added from Plato".
- [x] Featured is only a tag now.
- **Done when:** after picking a job on Plato, the extension opens on that job's search.

### 4. Job list (F)
- [x] Each row: letter badge per platform, "via Indeed → Greenhouse", match % (same 0–100 scale as the web).
- [x] Green "From Plato" tag.
- [x] "From Plato" filter (`fromPlato=true` on the server).
- **Done when:** the list matches the web Jobs page on source and match %.

### 5. Panel status (G)
- [x] "Applying to N jobs" shows only while the run has jobs.
- [x] Chat greeting has an idle state: "Nothing is being applied to right now…".
- **Done when:** no screen shows two statuses that disagree.

## Outside the extension
- OpenAI calls time out on the current network (connect takes 2–6 s, TLS 7–9 s). Test with a better connection or a VPN until step 2 removes the dependence on the AI.

### 6. AI-first apply (owner request 2026-10-19)
- [x] One AI call maps the whole form (every fillable field, up to 60) from the full profile: work history, skills, preferences, languages, links. Keyword matches are only the fallback when the AI has no answer ([panel/main.ts](src/panel/main.ts) `autoAdvance`, `aiAnswer`).
- [x] Order: AI → fill → fields the page reveals get their own AI pass (up to 3 rounds) → settle. LinkedIn steps use the same order.
- [x] Backend: AI first for all questions; the years-from-profile rule fills only what the AI left empty, or everything when the AI is down ([answers.service.ts](../plato-native-be/src/modules/extension/answers.service.ts)).
- [ ] Not yet: checkbox groups ("select all skills that apply") and custom dropdowns (Greenhouse's Country) are not sent to the AI.

### 7. One AI flow for every site (owner request 2026-10-19)
The old path for Greenhouse, Lever, Ashby, Workable, Indeed and Wuzzuf was: wait for a form → keyword field mapping → AI for leftovers → find a Submit button by rule. Replaced by one loop ([panel/ai-apply.ts](src/panel/ai-apply.ts)):

1. Open the job tab. `prepare` only waits for the page; with no form visible it hands over to the AI instead of giving up ([providers/generic.ts](src/providers/generic.ts)).
2. **Fill:** inspection (code, no AI) lists every field on screen; the AI gets those fields + the full profile and returns one JSON of field → value; the system fills and reads each value back. Revealed fields get their own pass.
   - **Repair:** a value that did not stick goes back to the AI with what it answered, why it failed and the page's error text. It returns a corrected value (up to 2 rounds). Only when it has nothing better is the seeker asked.
3. **Plan:** the AI page planner reads the page (text, controls, open dialog, required fields still empty) and picks one move: press Apply / Next / Review / Submit, wait, ask the seeker, skip (closed / already applied), or done.
4. Repeat (max 16 steps) until the page itself proves the submission. Submit is pressed once, never retried; with auto-submit off the job stops armed for the seeker.
5. A chat answer from the seeker resumes the same loop.

LinkedIn keeps its Easy Apply loop (same AI fill + AI planner, known buttons first).
Removed: `autoAdvance`, `settle`, `autoSubmit`, the shared form-mapping lookup/save, `auto-submit-hook.ts`.

### 8. Stop report
- [x] Every time the AI loop stops for the seeker, the extension records it on the item (reason + message, newest 20, state unchanged): `POST /extension/v1/items/:id/stops`.
- [x] `GET /extension/stops` (web session) groups them by site and reason, most frequent first, with up to 5 examples each. Reasons: `unanswered-fields`, `navigation`, `login-or-captcha`, `too-many-steps`, `page-lost`, `ai-asked`.

## Status 2026-10-20 (generic engine, incremental batches)

Verified in a real Chromium (`npm run test:runtime`, 19/19) and by unit tests (extension 198 passed, 1 pre-existing failure in `view.spec.ts`; backend 365 passed):

| Batch | What | Proof |
|---|---|---|
| 1 | One AI decision per page (`POST items/:id/decide`): page type, every field's value, missing fields, next move, seeker question. `finishDecision` re-checks the model. autoSubmit-off arms instead of asking. | `page-decide.spec.ts`, `ai-apply.spec.ts` |
| 2 | Loop verified end to end: inspect → decide → fill → verify → repair only after a failure → next page. Revealed fields get their own decision; nothing is decided twice while the page is unchanged; a page is decided only once settled (two looks agree, `readyState` complete). Request timeouts. Panel-lock handover on reload. | runtime flow A–D |
| 3 | LinkedIn through the same loop; Easy Apply code, `/plan` route and `aiAnswer` deleted. | suites |
| 4 | number/date/url fields; shadow roots; search-only pages and several forms → whole-page review with per-form tags (B1); radio questions to the AI. | `dom-*.spec.ts` |
| 5 | Tick lists (multi) and type-ahead lists (type, pick from the list, remembered pick); async fill. | `dom-fill.spec.ts`, runtime flow E |
| 6 | Resume: asked once per application and kept on it (B2); profile file or one built by `ResumeEngine` in auto mode (B3); upload via `DataTransfer`. | `resume-file.service.spec.ts`, runtime flow A |
| 7 | Fixture `stepper.html`: listing → Apply → 3-step dialog, a page-rejected value repaired by the AI, type-ahead, tick list, radio, Next/Review, Submit. | runtime flow E |

Open:
- Real jobs on each enabled site (owner, needs OpenAI reachable), then the stop report (`GET /extension/stops`) says what to fix next.
- B4: cross-ATS auto-submit (Indeed → Greenhouse) tested separately; policy unchanged.
- B5: generic site access (optional permissions) — not started, awaits approval.
- `view.spec.ts` pre-existing failure; a lone non-consent checkbox ("I have a licence") is still never ticked (product call).
