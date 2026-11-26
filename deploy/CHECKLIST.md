# Before a production deploy

## Mail (SendGrid): required

Without mail nobody can confirm an email address. An unconfirmed account gets no free tokens, so it cannot search or apply. Password resets fail too.

1. In SendGrid, verify the sending domain or the sender address, and create an API key with *Mail Send* access.
2. In `/opt/plato/.env` on the server, set `SENDGRID_API_KEY`, `MAIL_FROM` (the verified address) and, optionally, `MAIL_FROM_NAME`.
3. Deploy. The workflow stops before pulling new images if either variable is empty, and fails the smoke check if `GET /health` does not report `"mail":"on"`.
4. Test a real send once after every change to the key or sender:
   - Sign up with an address you can read and check that the confirmation email arrives. Open the link and check that the account shows its 1,000 free tokens.
   - On the login page, use *Forgot password* for the same address and check that the reset email arrives.

## One-time steps for the 2026-11-26 work

- `npm run prisma:push` in `plato-native-be`, against the production database. It creates the unique index on `guests.token_hash` and the guest indexes. The other schema changes need no push.
- `SUPPORT_EMAIL`: a repository variable is optional. It defaults to the address in the deploy workflow and is shown where a seeker asks for a plan or top-up, since there is no payment provider yet.

## Known failing tests (before 2026-11-26, not caused by this work)

| Test | Failing case | Why |
|---|---|---|
| `src/modules/quizzes/quizzes.spec.ts` | "validation: drafts that would not work are dropped › work style needs two different statements and a preferred side" | The quiz question builder and its test disagree. No quiz file changed in this work. |
| `src/modules/chat/page-registry.spec.ts` | "every registry control exists in the frontend code" | The assistant's page registry lists controls (`jobs.top-ten`, `career.coach`, `library.search`, and others) that the frontend no longer renders. It was already failing at `68cd8ec`, after the Career redesign (`809fa30`). |

Fix or update them before relying on a green test run as a release gate.
