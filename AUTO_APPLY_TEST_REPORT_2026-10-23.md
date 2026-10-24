# Extension auto-apply test, 2026-10-23

Dummy seeker (`plato.qa.20261023@example.com`, "Test Seeker", Cairo, generated CV), signup and onboarding through the backend API, two discovery runs (524 jobs), one batch of 10 jobs, one job per platform, run in a real headed Chromium with the production build loaded. Auto-submit was ON (forced in `settings.ts` since 2026-10-21). Nothing was submitted in the end: every item stopped before or at Submit. Run stopped on the owner's request after ~40 minutes; every item was cancelled from the panel (final server counts: 0 submitted, 3 failed, 7 cancelled).

Platforms: Greenhouse, Lever, Ashby, Workable (existing) + SmartRecruiters, BambooHR, Recruitee, Teamtailor, Personio, JazzHR (added today). LinkedIn, Indeed, Wuzzuf excluded by the owner.

## Result per platform

| # | Platform | Job | Got to | Blocked by | Root cause |
|---|---|---|---|---|---|
| 1 | Greenhouse | Infuse, Full Stack Developer | Custom questions filled, identity fields never stuck, never submitted | Last Name / Email / Phone "rejected by the page" on every round, also after the F1 fix; then asked for start date (mm/dd/yyyy) | **F1** stale `aria-invalid` (fixed) was one layer; the new Greenhouse UI still flags the fields right after typing: **F1b** needs a fixture of this page. **F5** date questions go to the seeker |
| 2 | Lever | Redbee, Fullstack Developer Senior | Every text field filled, Submit pressed, nothing happened | Required `<select>` "Which location are you applying for?" left on "Select..."; page validation blocked Submit; engine went to VERIFY ("cannot tell whether this was sent") | **F3** required native select with placeholder not answered; **F4** post-Submit check could not run (F2) so the validation error was never read |
| 3 | Ashby | ZOE, Full Stack Engineer | Resume attached, nothing else stuck; Submit pressed, nothing happened | Full Name, Email, Location, Phone all empty; "Start typing..." comboboxes; years-experience number field | **F6** Ashby form (no `<form>` element, custom inputs): text fill does not stick; needs a fixture from this page |
| 4 | Workable | Neuberger Berman, Sitecore Full Stack Developer | Embedded form on the listing: name, email, CV filled | Phone: page keeps only the national part ("10000000"), engine reads that as "the page changed it"; before the fix, every decision on the listing page was refused (F2) | **F2** (fixed) + **F7** phone widgets that move the country code into their own control |
| 5 | JazzHR | BAM Technologies, Full Stack Developer III | Page 2 filled: name, email, phone, address, salary, EEO radios | Five required yes/no `<select>`s left on "no selection"; engine asked the seeker for a "Date" field | **F3**, **F5** |
| 6 | SmartRecruiters | PSI CRO, Lead Software Developer | "I'm interested" pressed, apply UI opened | The oneclick-ui page rendered "The application form is temporarily unavailable due to a technical issue" | **F8** site-side (or bot check on the apply UI); needs a manual check in a normal browser |
| 7 | BambooHR | Kinetic, Sr. Applications Engineer | Listing opened | "The control I wanted is not on the page": the Apply button was not found | **F9** BambooHR's Apply control is not seen by the inspector (likely a link or shadow DOM); needs a fixture |
| 8 | Recruitee | Enersee, Full Stack Developer | Apply pressed, `/c/new` form: CV, GitHub, location, visa/language radios filled, "Send" pressed | Full name / email / phone (prefilled "+32") were never in the decision's field list (6 read, 6 answered: the identity block was missed), so Send was blocked by the page; then "the server took it back" | **F16** identity fields not inspected on this page, **F10** lease lost during the extension reload |
| 9 | Personio | atwork, Full Stack Developer | Every text field filled correctly (name, email, phone, available from, salary, location); CV attached once | Later rounds read 0 fields and asked the seeker to upload the CV, nine times | **F14** resume upload not recognised after the page re-rendered, **F15** the same ask repeated every round without backoff |
| 10 | Teamtailor | Swan, Software Engineer | Apply dialog opened, location chosen, LinkedIn filled | Asked the seeker to upload the CV eight times (0 fields read in the dialog); cookie-banner checkboxes inspected as fields | **F14**, **F15**, **F11** cookie consent controls must be excluded |

Backend evidence per item: `GET /extension/stops` (grouped by site and reason), `apply_batch_items.detail`, backend stdout in the session scratchpad, and the extension's per-item journals (`chrome.storage.session` keys `journal:<item>`), all captured during the run.

## Findings (generic, not per site)

**Fixed today**
- **F1 Stale `aria-invalid` cleared the engine's own values.** `fillText` read `aria-invalid` right after blur; React forms set it on the next render, so a `true` left over from the page's earlier "required" error was read as a rejection and the value was restored to empty. Every retry re-triggered it. Fix: remember the flag before typing, wait 120 ms after blur, treat only a newly appearing flag as a rejection; `readBack` no longer uses the attribute (the repair step reads the page's error text). Spec added in `test/dom-fill.spec.ts`.
- **F2 Zero-field pages were refused by the backend.** `decideBodySchema.fields` was `answersSchema.shape.questions.min(0)`; zod keeps the earlier `.min(1)`, so a listing page or a post-Submit confirmation page (0 fields) got HTTP 400 and the extension showed "Plato's AI could not be reached (Invalid request)". Hit Workable, Lever, Ashby, SmartRecruiters. Fix: own `z.array(questionSchema).max(60)`; spec `decide-schema.spec.ts`. The 400 now logs the zod issue (`ExtensionApi` warn) so the next one is visible in the backend log.

**Open, ranked by how many platforms they block**
- **F3 Required `<select>` with a placeholder option is left unanswered** (Lever location, JazzHR's five yes/no questions). The decision returns no value for selects whose options are not in the profile; the fill then skips them and Submit is blocked by the page. Expected: the AI must pick from the options (a yes/no, a location from the posting) or ask one question.
- **F4 No read of the page's validation errors after Submit.** When Submit does nothing, the loop goes to VERIFY ("cannot tell whether this was sent") instead of re-inspecting and reading the inline errors. With F2 fixed this path can now run; it still needs to read `[role=alert]` / error text next to fields and repair.
- **F5 Date questions are asked to the seeker.** "When are you available to start (mm/dd/yyyy)", JazzHR "Date": the profile has availability "immediately"; the decision should produce a formatted date.
- **F6 Ashby text inputs do not take values.** All identity fields empty after fill and repair. Needs a saved fixture of this page and a runtime flow.
- **F7 Phone widgets that split the country code** (Workable: field shows "10000000", code in a separate control). `shows()` compares all digits; accept when the shown digits are the national tail of the wanted number, or set the country control first.
- **F8 SmartRecruiters apply UI** showed a site-side error. Check by hand; if it is bot detection, it is a policy question, not an engine bug.
- **F9 BambooHR Apply control not found.** Needs a fixture.
- **F10 Extension reload drops the lease** ("the server took it back"): heartbeats stop while the service worker restarts; the item goes back to the queue and the panel shows the legacy Use/Skip review rows instead of resuming the AI loop.
- **F11 Cookie-consent checkboxes inspected as form fields** (Teamtailor). Exclude consent banners / dialogs outside the application form.
- **F12 Stopped items hold the concurrency slots.** Four stops meant the other six jobs never started until the reload freed the slots. A stopped (NEEDS_USER / VERIFY) item should release its slot.
- **F14 Resume upload inside dialogs / after re-render** (Personio, Teamtailor): the file is attached once, then later rounds no longer see the upload field, read 0 fields and ask the seeker to upload. The upload must be re-checked by the file input's state, not by the field list.
- **F15 The same ask is repeated every round** (9x Personio, 8x Teamtailor in `/extension/stops`): a stop with the same reason should not be re-raised until something changed.
- **F16 Identity block missed by the inspector on Recruitee** `/c/new` (6 fields read, none of name/email/phone).
- **F13 Non-English questions**: Lever's Spanish questions were answered correctly (good), but the answer text "4000-6000 USD per monthly" shows the salary string is pasted, not adapted; minor.

## Also changed today (outside the engine)
- Six new providers wired: `provider-policy.ts`, `ats-detect.ts`, `apply.types.ts`, extension `definitions.ts`, `docs/providers/six-ats-2026-10-23.md`.
- Form-mapping store and its version control deleted (backend service, routes, prisma model, `mapping:rw` scope, extension API calls, `core/mapping.ts`, `docs/FORM_MAPPING.md`).
- `POST /job-seeker/jobs/by-url {url}`: a pasted job link becomes a MANUAL job on the latest search (how Recruitee, Teamtailor, Personio, BambooHR entered the batch; discovery never returns those hosts). No UI yet.
- `extensionProvider` routes by the apply link's ATS before the board source (an Indeed listing whose form is on JazzHR is a JazzHR item).
- Discovery note: in run 1, Bayt, Naukrigulf, GulfTalent, WeWorkRemotely, WorkingNomads, Wellfound, Arc, Jobgether, NoDesk all failed with Apify "exceed your limit of 32 concurrent runs"; run 2 (fewer boards active) was fine. Discovery should cap concurrent actor runs.

## How the test was driven
Backend and web through their HTTP API (signup, CV upload, analyze, preferences, discover, batch). Extension through its own panel UI in a headed Chromium (`scratchpad/driver.mjs` keeps the browser; each step is a click sequence on the panel: Link, Review jobs, Start, Try again, "I did not submit it"). No extension internals were called.
