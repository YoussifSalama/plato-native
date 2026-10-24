# Provider decision: Greenhouse

**Policy: `FILL_ONLY`, auto-submit allowed (per run, with the seeker's opt-in).** Activated 2026-10-17.

| Field | Value |
|---|---|
| Scope | `boards.greenhouse.io`, `job-boards.greenhouse.io` and the `.eu` variants: job pages `/<company>/jobs/<id>` and `/embed/job_app` |
| Mode | The extension fills the guest application form in the seeker's own browser tab and, if the seeker opted in for the run, presses Submit (max 3 tries, never re-clicks once the page changed). Otherwise or on failure the seeker submits. |
| Decision made by | The product owner, in chat, 2026-10-17: "allow greenhouse first no problem" |
| Terms reviewed | **Not reviewed by the developer.** The owner accepted this risk to start testing. A real terms and robots review of Greenhouse and of the individual employers' boards is still owed before public launch. |
| Source links | _to add when the review is done_ |

## Guardrails that stay on
- No captcha / human-check solving: a visible check stops the job and asks the seeker (`needs-user: captcha`).
- Required fields the engine cannot fill, sensitive fields, consent boxes and low-confidence answers are never auto-filled; the job stops for the seeker.
- Auto-submit needs the seeker's opt-in in the wizard (saved in the consent audit log), exactly one visible Submit button, and the job recorded as armed on the server first.
- A page that changes after a click without a clear confirmation goes to VERIFY, never a second submit.
- Switch off server-side by setting `greenhouse: 'BLOCKED'` (or removing it from `AUTO_SUBMIT` to keep fill-only) in `provider-policy.ts`.
