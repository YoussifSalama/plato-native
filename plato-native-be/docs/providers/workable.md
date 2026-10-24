# Provider decision: Workable

**Policy: `BLOCKED`.** No decision has been made. The terms review has **not** been done.

| Field | Value |
|---|---|
| Intended scope (after clearance) | `https://jobs.workable.com/view/*` only |
| Intended mode | `FILL_ONLY`: the extension fills the form in the user's own tab; the user always presses Submit |
| Terms reviewed on | _not yet_ |
| Reviewer | _not yet_ |
| Source links (ToS, robots, API terms) | _not yet_ |
| Decision | _pending_ |

## Rules while BLOCKED
- The production extension manifest has no Workable match and no content scripts.
- Tests use local fixtures only (fixture build matches `127.0.0.1` fixtures). No live page is opened or automated.
- Unknown providers are treated as BLOCKED.

## To clear it
1. Read Workable's terms and any automation / bot policy; record links, date, reviewer and the decision above.
2. Flip `PROVIDER_POLICY.workable` to `FILL_ONLY` in `src/modules/extension/provider-policy.ts` in a reviewed change.
3. The manifest test must show the manifest matches equal exactly `enabledMatches()`.

If the site's terms forbid the flow, or a CAPTCHA / bot check appears, the item ends `blocked_by_site`; the extension never bypasses it.

## Disclosure
Before this gate existed, one public Workable posting was opened in a headless browser and its "Apply now" control was clicked during research. Nothing was entered or submitted. This is not to be repeated while the policy is BLOCKED.
