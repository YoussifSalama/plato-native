# M5A: generic DOM inspection and form filling (fixtures only)

Provider-agnostic engine in `src/dom`, driven by `src/core/form-flow.ts`. Runs only on synthetic local pages. No provider adapter exists or is enabled; every provider stays BLOCKED, and in production nothing injects the engine (no content script, no `dom` code in the bundle).

Flow: `inspect` (content script) -> `mapFields` (panel, needs the profile) -> `fill` (content script, only mapped values) -> `verify` (read-back) -> review in the panel. It stops there. There is no submit message, no submit code path, and submit events are blocked while filling.

- **Inspect** (`inspect.ts`): visible, enabled, editable controls. Label from aria-labelledby, label[for], wrapping label, aria-label, legend, title, then placeholder/name (weak). Required from `required`, `aria-required`, `*`. Options for select/radio/checkbox groups. Reports `hasValue`, never the value. Password, OTP, payment, ID and similar fields are only counted. Hidden, disabled, read-only, `aria-hidden` (honeypots) and off-screen controls are skipped. Textarea, date/file/number/url, multi-select, typeahead and custom ARIA widgets are listed as unsupported and never touched.
- **Map** (`mapper.ts`): identity fields only (first/last/full name, email, phone, city, country, LinkedIn, GitHub, portfolio, current company). Evidence: autocomplete token 0.98, exact label 0.95, native type 0.9, phrase 0.8 (never acted on), placeholder/name capped. Acts at >= 0.85. Held, with a reason, when: ambiguous (two keys within 0.1), low confidence, duplicate label, duplicate key (two fields for one key; "confirm email" twin allowed), already filled, no profile value, no matching option, or consent/choice controls (always the person's).
- **Fill** (`fill.ts`): text/email/tel via the native value setter + `input`/`change`; select by value or label; checkbox/radio by a real click only when the state must change. Each result is read back; mask/pattern/type/maxlength/aria-invalid rejections restore the previous value and are reported.
- **Review** (`review.ts`): filled / failed / held / unsupported / required-still-empty / sensitive count. The person reviews and presses Submit.

Not in M5A: answer drafting, resume access, free-text answers, live providers.
