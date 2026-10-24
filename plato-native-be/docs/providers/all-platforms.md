# Provider decisions: all registered platforms

**Policy: `FILL_ONLY`** for Greenhouse, Lever, Ashby, Workable, LinkedIn, Indeed and Wuzzuf. Activated 2026-10-17 by the product owner in chat: "allow all for now" / "شغل كل البلاتفورمز".

| Platform | Scope (content script) | Auto-submit | Notes |
|---|---|---|---|
| Greenhouse | boards / job-boards (+ .eu) | yes (opt-in per run) | see greenhouse.md |
| Lever | jobs.lever.co | yes (opt-in per run) | guest form |
| Ashby | jobs.ashbyhq.com | yes (opt-in per run) | guest form |
| Workable | jobs.workable.com/view, apply.workable.com | yes (opt-in per run) | guest form |
| LinkedIn | www.linkedin.com/jobs | yes (opt-in per run) | runs in the seeker's own logged-in browser. The extension presses Easy Apply, reads each step of the dialog, fills it, presses Next / Review, and Submit application. Stops for the seeker on: sign-in or verification, a required field it cannot answer, an error it cannot clear, a step that does not move, or an unfamiliar step |
| Indeed | *.indeed.com/viewjob | **no** | same: own login, multi-step |
| Wuzzuf | wuzzuf.net/jobs/p | **no** | same |

**Terms reviewed:** none by the developer. The owner accepted the risk to start testing. Automating a logged-in account (LinkedIn, Indeed, Wuzzuf) can breach those sites' terms and may get the seeker's account restricted. A real terms review is owed before launch.

Switch any platform off server-side with `'BLOCKED'` in `provider-policy.ts`. Guardrails that stay on everywhere: no captcha solving, no sensitive/consent fields auto-filled, auto-submit only with the seeker's per-run opt-in, a page that changes after a click without proof goes to VERIFY.
