# Decision: Chrome extension apply engine

Status: approved as MVP plan (Revision 3). Implementation is staged by milestone; no provider is enabled.

## Previous attempt
The backend Auto Apply module (`src/modules/apply`) drives a server-side browser. It hit CAPTCHA and other human-verification checks it must not and cannot defeat. It is **frozen legacy code**: kept, not extended, not deleted, and not used by the extension.

## Decision
Applications on supported sites run in the **user's own browser** through a Chrome extension (side panel). The extension fills the form; **the user always presses Submit**. The extension does not solve CAPTCHA or bypass any protection: it pauses and the person completes the check.

## Boundaries
- Extension: page inspection, filling, review, queue, progress. Holds no server secrets.
- Backend (shared, reused): profile, resume, eligibility, readiness, answer drafting, metering, application records. Not the legacy executor.
- Legacy worker: only touches `engine` null/LEGACY rows. `EXTENSION_ACTIVE` / `engine=EXTENSION` rows are rejected by legacy retry, withdraw, answers, mark-submitted and verification endpoints (`engine-guard.ts`), and by the legacy queue path.

## Auth
Pairing code -> opaque scoped token (30 days absolute, 14 idle, 5 devices), Bearer, `credentials:'omit'`, stored server-side as SHA-256. Extension keeps it in `chrome.storage.local` with `TRUSTED_CONTEXTS` (not encrypted; revocable). No `externally_connectable`, no host permissions.

## Duplicate safety
`JobApplication` is unique per (seeker, job). A claim moves the row to `EXTENSION_ACTIVE`; `AWAITING_SUBMIT` is written before the page is shown ready; when the outcome is unclear the item goes to `VERIFY` for a person. Machine-confirmed and user-attested submissions are recorded separately. Nothing is ever resubmitted automatically.

## Provider gate
`src/modules/extension/provider-policy.ts`; per-provider record in `docs/providers/`. Workable is `BLOCKED` (terms review pending). Tests use local fixtures only.

## Known limits
Not every site or form is supported. The extension does not solve CAPTCHA. Sites may forbid the flow; then the item ends `blocked_by_site`.

## Item state machine (M3)
`PENDING -> CLAIMED -> PREPARING <-> NEEDS_USER / FILLING -> REVIEW -> AWAITING_SUBMIT -> SUBMITTED_CONFIRMED | SUBMITTED_ATTESTED | VERIFY`; `FAILED`, `SKIPPED`, `CANCELLED` are allowed only **before** `AWAITING_SUBMIT`. Table: `src/modules/extension/batch-state.ts`.

- **Claim** is two atomic steps: item `PENDING -> CLAIMED` (new `attempt_id`, 90 s lease), then the `JobApplication` row becomes `EXTENSION_ACTIVE` / `engine=EXTENSION`. If the job already has an application (any status except FAILED/SKIPPED/EXPIRED) the claim is refused; if two items race, the unique (seeker, job) row lets one win and the other is `SKIPPED (duplicate)`.
- **Transitions** are idempotent by `(attempt_id, seq)`; stale attempts and gaps get 409. A replay of an applied transition also repairs the application row.
- **Lease**: the panel heartbeats (max 6/min/item). Recovery is a lazy sweep on list/claim/transition (no timers). Lease lost **before** `AWAITING_SUBMIT`: item back to `PENDING`, lock released (row deleted if the claim created it, otherwise the prior status is restored). Lease lost **at/after** `AWAITING_SUBMIT`: item goes to `VERIFY`, the lock is **kept**, nothing is retried.
- **Outcome evidence**: `SUBMITTED_CONFIRMED` requires the page marker the extension saw; `SUBMITTED_ATTESTED` is the person's word. They are stored separately (`evidence.confirmed_by`). Anything unclear is `VERIFY`, settled only by a person (confirmed / attested / not submitted -> `FAILED`). No endpoint ever resubmits.
- Web (cookie) can create batches and release an item only before it is armed. The provider gate is checked at batch creation and again at claim.

## Known limitations
- Pairing: wrong guesses can't be tied to one code, so exchange is limited per IP (5/min) plus a **global breaker** (50 wrong codes in 10 minutes blocks all exchanges). An attacker can therefore delay everyone's pairing for up to 10 minutes. Per-code burn would need a short public code prefix (schema change); not done.
- The rate limiter is in memory (single API instance); `req.ip` is the proxy's address unless `trust proxy` is configured.
- Item/application writes are conditional updates, not transactions (Mongo without a transaction layer): a crash between the two is repaired by replaying the transition.
