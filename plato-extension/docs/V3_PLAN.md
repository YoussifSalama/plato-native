# Plato Apply engine v3 — plan (2026-10-24)

v2 (our own inspect → decide → fill → verify → repair loop on OpenAI) is frozen. v3 replaces the engine with Anthropic's **browser use tool**: Claude plans every browser action, our code executes it. Everything around the engine (pairing, queue, leases, state machine, panel, journal, policy, audit) stays.

Sources read for this plan: the browser use tool reference, the SDK browser toolset guide, the TypeScript SDK `browser-toolset.md`, the `claude-quickstarts/browser-toolset` CDP driver, the web fetch tool reference. Exact names below come from those pages.

## 1. What the Claude web tools are, and which one we use

| Tool | What it is | Use in Plato |
|---|---|---|
| `browser_toolset_20260801` (browser use tool) | A **client toolset**, GA on the Claude API and Google Cloud. One `tools` entry, no `name`, no beta header. Claude returns member calls (`navigate`, `read_page`, `find`, `form_input`, `left_click`, `type`, `key`, `scroll`, `screenshot`, `zoom`, `file_upload`, tabs…) as `tool_use` blocks carrying `"toolset_name": "browser"`; our executor runs them in **our** browser and answers each with a `tool_result` that echoes `"toolset_name": "browser"`. Nothing runs on Anthropic's side. Several calls per turn, in order; stop at the first failure and answer the rest `is_error: true` with `Not executed: an earlier action in this turn failed.` Toolset overhead ≈ 6,600 input tokens per request (+880 with the 4 optional members). Supported models include `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`. | **The engine.** |
| SDK browser toolset (`BetaAbstractBrowserToolset20260801` in `@anthropic-ai/sdk/helpers/beta/toolsets`, beta) | A base class whose member methods you implement; options `urlPolicy`, `confirm`, `configs`, `filePolicy`, `browserState`. `client.beta.messages.toolRunner({ tools: [driver] })` runs the loop. The docs say you may override `execute` and *skip `super`* to forward calls to a remote browser. | **The server-side half.** Our driver forwards each call to the extension. |
| `web_fetch_20260318` / `web_search_20260209` (server tools) | Read pages / search. No JavaScript rendering, no clicks, no forms. No extra charge beyond tokens. | Not for applying. Candidate later for job discovery (replacing some Apify boards) — out of v3 scope. |
| Computer use (`computer_toolset_20260801`) | Whole desktop by screenshots. | No. |
| Claude in Chrome | Anthropic's consumer extension; no embeddable SDK. | No. |
| Claude Agent SDK | Claude Code as a library, runs on a host, not in the browser. | No. |

## 2. Architecture

```
Plato web ──pick jobs──▶ backend ──batch/items/lease/state (unchanged, v2)
                                      │
   extension panel ◀── items, journal ┘
        │  per item: POST /extension/v1/items/:id/v3/turn   { results: [...] }   ──▶  backend
        │                                                    ◀──  { calls: [...] | done | ask }
        ▼
   executor (extension) = the driver's browser half
        content script  : read_page/find/get_page_text/form_input/scroll_to (DOM + accessibility names, refs)
        chrome.debugger : left_click/type/key/scroll/screenshot/zoom/file_upload (real input events, CDP)
        chrome.tabs     : navigate/new_tab/switch_tab/close_tab/list_tabs + browser_state
```

**Where the Claude loop runs: the backend.** The API key never enters the extension. The backend holds the conversation per item (messages array in memory, journal + outcome persisted on the item as today), calls `client.beta.messages.create` with `tools: [driver.toJSON()]` (the "run without the tool runner" shape from the SDK guide), and returns the turn's calls to the extension. The extension executes them in order and posts the results; the backend appends them and asks Claude for the next turn. Stateless HTTP, restartable, fits the lease/heartbeat model. The SDK driver class is used server-side only for the tool definition, result shaping (`browser.toolResult`), the URL policy, `confirm`, and `configs`; its `execute` is overridden to forward to the extension (the guide's "remote browser" case).

Why not the extension calling Claude directly: key exposure. Why not SSE/WebSocket: not needed; the extension is already the loop driver in v2.

**Per-item conversation shape**

- `system`: the application contract (below) + the seeker's profile summary (same `profile-summary.ts` as v2) + the job (title, company, description head) + run settings (resume mode, cover letter on/off).
- `messages[0]`: "Apply to this job: <url>. The resume file is staged as document id `resume`." Then the loop.
- Prompt caching: `cache_control` on the system block and on the toolset definition (`toolConfigs`), so the 6.6k toolset + profile are read from cache every turn.
- Context: `context_management.edits: [{ type: "clear_tool_uses_20250919" }]` with the beta header, so old screenshots and page trees leave the window; cap turns at 40 per item.

## 3. Rules Claude follows (system prompt) and rules code enforces

Prompt (Claude's job): fill every field the profile supports; read the tree before any screenshot; use `form_input` for selects/checkboxes and `left_click` + `type` for text; type-ahead lists: type, read the options with `find`, click the match; never invent a fact (work authorization, residence, background, licences, demographics → ask the seeker via a final text answer `ASK: <question>`); choice questions always answered from the options; dates from availability; stop and report `CAPTCHA` when a human check appears; `SUBMIT_READY` when every required field holds a value and the only thing left is the Submit control — never press it yourself.

Code (cannot be talked out of):
- `urlPolicy`: only the job's apply host (the same provider allow-list as v2 policy) plus the hosts the page itself navigates to (`navigate` to another origin needs a `navigation_refused` + journal line).
- `confirm`: `file_upload` only with the staged resume document id onto a file input; `javascript_exec`, `read_console`, `read_network` stay disabled.
- **Submit gate:** the extension's executor refuses any `left_click`/`key Enter` whose target is a submit control until the backend has armed the item (`AWAITING_SUBMIT`, exactly as v2). Arming happens when Claude reports `SUBMIT_READY` and the run's auto-submit is on; the press is then issued by the executor once, and the loop continues with one more turn to read the outcome page (confirmation / "already applied" / refusal / captcha). Never a second press (v2 rule kept).
- Fact questions: if Claude's text ends with `ASK:` the item goes to `NEEDS_USER` with that text; the seeker's answer is appended as the next user message (same chat path as v2).
- Captcha/anti-bot: executor detects captcha frames and refusal text (v2 `page-state.ts`, kept) → `NEEDS_USER` with "solve it on the page", loop paused; after the seeker presses "I solved it", one more turn.
- Duplicate protection: item state machine + `armed` flag + one press per item (v2).

## 4. What is kept from v2 (used as-is)

Backend: extension module (pairing, devices, batches, queue, leases, heartbeat, transitions, stops, `/extension/stops`, candidate/profile summary, resume file service with the new `resume_choice` column, settings), provider policy + ATS detection, `jobs/by-url`. Extension: panel (wizard, ready card, item cards, chat tickets), `core/orchestrator.ts` (claim/heartbeat/transition/observe/arm), journal + trace, `dom/page-state.ts` (captcha/closed/confirmed markers), `panel/trusted.ts` (CDP attach + click/key/type), `content/overlay.ts` (the "Plato is working" bubble + Stop). Tests: runtime harness servers, fixtures, pairing/CSP/policy flows.

Dropped: `panel/ai-apply.ts`, `core/form-review.ts` + `form-review-hook.ts`, `dom/inspect.ts`/`fill.ts`/`mapper.ts`/`snapshot.ts` as the engine (parts are reused inside the executor: visibility, labels, the FNV ref registry, `setFile` via DataTransfer), backend `page-decide.agent.ts`, `answers.service.decide`, `page-plan.*`, the years/date rules (Claude reads the profile directly; keep `dateAnswer` only if the spike shows date formatting failures).

## 5. Executor members (extension) — mapping to what exists

| Member | Implementation | From v2 |
|---|---|---|
| `read_page` (`filter`, `depth`, `ref`) | Content script walks the DOM, builds `role "name" [ref_N]` lines (ARIA role / tag → role; accessible name from label/aria/placeholder, value and state appended), keeps a ref → element map per tab, resets on navigation; interactive filter = inputs/buttons/links/selects/comboboxes. Cap 50k chars. | `inspect.ts` labelOf/isVisible/registry |
| `find` | Content script: score elements by query words over name/role/placeholder; top 20 in the same format. | new (no AI call; the doc allows a heuristic) |
| `get_page_text` | `innerText` of main/body, trimmed. | `snapshot.ts` deepText |
| `form_input` | Content script: select by value/text, checkbox/radio by boolean, text via native setter + events, then read back; error if the value did not stick. | `fill.ts` fillSelect/setChecked/setNativeValue |
| `left_click` / `double_click` / `right_click` / `hover` / `scroll` | Resolve ref → viewport point → `chrome.debugger` `Input.dispatchMouseEvent`. | `trusted.ts` click, `dom/point.ts` |
| `type` / `key` / `hold_key` | `Input.insertText` for text; `Input.dispatchKeyEvent` for keys and chords. | `trusted.ts` type/key |
| `scroll_to` | `element.scrollIntoView` in the content script. | new |
| `screenshot` / `zoom` | `chrome.debugger` `Page.captureScreenshot` (viewport, scale 1), zoom = clip rect; resize to ≤ 1568 px. | new |
| `file_upload` | Only `document_ids: ["resume"]`: the content script sets the file through `DataTransfer` from the bytes fetched via `GET items/:id/file`. | `fill.ts` setFile |
| `navigate` / tabs / `browser_state` | `chrome.tabs` + the Plato tab group; `tab_id` = our item's tab; report all Plato tabs, one active. | `panel/main.ts` tab handling |
| `wait` | sleep ≤ 30 s, then settle (v2 `dom/settle.ts`). | `settle.ts` |

## 6. Phases

**Phase 0 — spike. DONE 2026-10-24: go (6/6 targets SUBMIT_READY; results in ENGINE_AUDIT_2026-10-23.md § v3 Phase 0).** Node script in `plato-native-be/scripts/v3-spike/` using the SDK tool runner + the quickstart CDP driver extended with `form_input`, `type`, `key`, `screenshot`, `file_upload` (document id → a temp PDF), against a headed Chromium with a throwaway profile, the dummy profile in the system prompt, the Submit gate as a `confirm` that refuses submit presses. Targets: Meridial (Greenhouse EU), Lever Redbee (form page only), Ashby Bjak, plus the v2 runtime fixtures `form.html`/`stepper.html`/`rejects.html`. Measure per page: stage reached (filled / submit-ready / asked / captcha), turns, input+output tokens, cost, wall time. Go/no-go: Claude reaches SUBMIT_READY with every required field holding a verified value on ≥ 2 of the 3 real pages and all 3 fixtures. **Needs an `ANTHROPIC_API_KEY`** (none in the repo today) and `npm i @anthropic-ai/sdk@^1`.

**Phase 1 — backend brain. DONE 2026-10-24 16:20.** `src/modules/extension/v3/`: `v3-contract.ts` (versioned call/result JSON), `v3-session.service.ts` (conversation per item in memory, Claude call with the toolset + caching + context editing, URL policy and member refusals server-side, Submit gate state, turn cap 40, cost in `usage_events` as `extension.v3.turn`), `v3.controller.ts` (`POST items/:id/v3/turn`, `GET items/:id/v3/status`). A backend restart ends the session (`409 session_lost`); the extension starts over from the page as it is. JSON body limit raised to 12 MB (screenshots). Proven through `scripts/v3-spike/remote-exercise.ts` (plays the extension with the spike's CDP driver against the live endpoint): Meridial SUBMIT_READY 15 turns 99 s, Lever 10 turns 62 s, Ashby 11 turns 51 s — every required field verified in the final tree, Submit gated, nothing sent (results in ENGINE_AUDIT § v3 Phase 1).

**Phase 2 — extension executor. DONE 2026-10-24 16:50 (harness-proven; live run = Phase 3).** `src/v3/contract.ts` (mirror of the backend contract), `src/content/v3-reader.ts` (read_page / find / get_page_text / form_input / resolve / describe / set_file / the submit guard; the spike's page scripts ported as typed code), `src/v3/executor.ts` (member dispatch: content script for reads and values, `chrome.debugger` for presses, keys, wheel and screenshots; the Submit gate and the page guard in code), `src/v3/run.ts` (the loop: turn → execute in order → post results; SUBMIT_READY arms the server first; CONFIRMED only with its quote on the page; a page-detected captcha stops the run). Wired in `panel/main.ts` (`runV3Item`, chosen by the build define `__ENGINE__`: production default v3, `--engine=v2` keeps the frozen engine; the fixtures build stays v2 for its own suite). `api.v3Turn`, `orchestrator.confirm(marker)`. Tests: `test/v3-run.spec.ts`, `test/v3-executor.spec.ts`, `test/v3-reader.spec.ts` (34 cases); runtime `npm run test:runtime:v3` (a scripted brain in `test/runtime/servers.mjs`): flow A through v3 (every field incl. the revealed city and the resume, consent by a real click, honeypot untouched, armed before the person is told, "Submit for me" presses once, confirmation recorded), the Submit gate (a rogue brain's early press is refused, the rest of its turn not executed, nothing sent), no third-party requests. Not covered by fixtures: a second press after a page error (v3 presses once, then reports the page's words; the seeker decides). Added 2026-10-24: captcha resume (`captcha.html`: the page's human check stops the run, the seeker solves it, Try again sends `solved`) and ASK resume (the question lands in the panel chat, the seeker's reply reruns the job with `seeker_answer` and that note, the answer is written into the form) — `npm run test:runtime:v3` 7/7.

**Phase 3 — live (1 day). NEXT.** Same three real pages through the real panel (owner reloads `dist/production` in Chrome; production always presses Submit once SUBMIT_READY, owner rule 2026-10-21); then the v2 ten-platform list (Workable, JazzHR, SmartRecruiters, BambooHR, Recruitee, Teamtailor, Personio, Greenhouse, Lever, Ashby). Same metrics as the exit review: form filled, Submit pressed, site response, confirmed.

**Phase 4 — cost and cut-over.** Cache hit rate, tokens per application, `claude-sonnet-5-5` vs `claude-opus-5-5` on the same pages; keep v2 behind a flag until v3 beats it on the live list. Prep done 2026-10-24: `GET /admin/usage/v3?days=30[&model=][&item=]` (header `x-admin-key: $ADMIN_REPORT_KEY`; 404 without it) reads the `extension.v3.turn` usage rows and returns per item and model: runs, turns, input tokens, cache-read tokens, cache hit rate, output tokens, dollars, seconds first to last turn, item state and job; totals per model (average cost and turns per item); and `compare`, the jobs run on more than one model side by side. To compare: run the list with the default (`claude-sonnet-5-5`), set `V3_MODEL=claude-opus-5-5` in `plato-native-be/.env`, restart the backend, run the same jobs again (new picks), then read the report. Price table in `v3-session.service.ts` checked against Anthropic's list 2026-10-24 (Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, cache read $0.20, cache write 1.25× input).

## 7. Risks and open points

- **Cost per application.** 6.6k toolset + profile every turn; 10–25 turns per application; screenshots are the expensive part. Caching + "tree before screenshot" keep it in the low tens of cents on Sonnet; measured in Phase 0.
- **Latency.** One Claude turn per batch of actions (2–6 s each). An application will take 1–3 minutes, as v2 did.
- **Captchas and spam filters do not go away.** Same stops as v2; the win is in the form stage.
- **Prompt injection from job pages.** The page is untrusted; the URL policy, the submit gate and the disabled `javascript_exec` are the defence; Anthropic also runs classifiers on browser results.
- **Element refs on virtualised/canvas pages**: Claude falls back to screenshots + coordinates (documented behaviour).
- **Vendor lock**: the executor speaks the toolset's member contract; the brain is the only part tied to Anthropic.
