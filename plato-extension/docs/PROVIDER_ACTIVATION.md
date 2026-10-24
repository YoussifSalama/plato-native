# Activating a provider

Every provider in `src/providers/definitions.ts` is **BLOCKED** and has **no adapter**. Registering a provider is architecture only: it opens, reads and fills nothing. A provider may be enabled only when **all** of the following are done, in this order, each in a reviewed change:

1. **Terms and policy review.** Read the site's terms, robots/automation policy and any API terms. Record links, date, reviewer and the decision in `plato-native-be/docs/providers/<provider>.md`. If the terms forbid the flow, or the site uses CAPTCHA / bot protection against it, the provider stays BLOCKED. The extension never bypasses a protection.
2. **Supported URL scope.** Write the narrowest Chrome match patterns (`urlPatterns`) that cover the pages the review approved. No `<all_urls>`, no bare `*` host, no `*://`; `createRegistry` rejects them. Decide `applyVia` for each page type: a board's own form (`internal-form`) vs a redirect to a company site or ATS (`external-ats`). If the URL alone cannot tell (LinkedIn, Indeed, Wuzzuf listings), the adapter must inspect the page and the route stays `apply_route_unknown` until it can. An external destination is routed by **its own** host and needs its own provider review.
3. **Adapter and tests.** Implement `ProviderAdapter` (`prepare`, `inspectOutcome`). There is no submit method and there must never be one: the person presses Submit. Test it against local fixtures (synthetic pages in `test/fixtures`), including: login / MFA / CAPTCHA pause, unsupported page, validation errors, and an outcome that is clear vs ambiguous (ambiguous -> `VERIFY`). No live automation test.
4. **Explicit activation approval.** Only then flip `policy` to `FILL_ONLY` here **and** in `plato-native-be/src/modules/extension/provider-policy.ts`. Effective policy needs both sides: the server serves its policy at `/extension/v1/policy` and anything the server does not say `FILL_ONLY` is blocked.

Activation adds a static content-script match to the manifest for that provider only; `test/manifest.spec.ts` pins the shape. Adding host permissions or any other privilege needs separate approval.

## Current status
All seven registered platforms are **FILL_ONLY** since 2026-10-17 (owner: "allow all for now"); the decisions and caveats are in `plato-native-be/docs/providers/all-platforms.md` and `greenhouse.md`. **No terms review was done by the developer.**

| Provider | Policy | Adapter | Auto-submit | Notes |
|---|---|---|---|---|
| Greenhouse | FILL_ONLY | generic form | yes (opt-in) | guest form |
| Lever | FILL_ONLY | generic form | yes (opt-in) | guest form |
| Ashby | FILL_ONLY | generic form | yes (opt-in) | guest form |
| Workable | FILL_ONLY | generic form | yes (opt-in) | jobs.workable.com/view and apply.workable.com |
| LinkedIn | FILL_ONLY | board | no | own login; Easy Apply is multi-step and not stepped through: the job stops for the seeker |
| Indeed | FILL_ONLY | board | no | same |
| Wuzzuf | FILL_ONLY | board | no | same |
