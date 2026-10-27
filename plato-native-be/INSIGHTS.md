# Job alerts (insights)

A seeker asks to hear about new jobs in a **field** ("Frontend Engineer", optionally a place or remote-only) or at **companies they follow**. New jobs are sent together in one **digest** on the seeker's cadence: in Plato (bell + notifications page) and by email.

## Rules

- **Digests only.** Never one message per job. Cadence: Daily, Every 3 days (default), Weekly. Nothing new, nothing sent.
- **Never a closed job.** Right before a digest goes out, each job is checked again (`verdict` in `alert-rules.ts`):
  - `expired_at` set → dropped (`closed`).
  - Posted more than 21 days ago → dropped (`too_old`).
  - Greenhouse, Lever, Workable and the free feeds: the listing is fetched again unless we looked in the last 24h. If it's gone, the job is marked expired and dropped. If there's no answer (blocked or timeout), the job goes only if under 7 days old.
  - Boards we can't check (LinkedIn, Indeed…): only jobs under 7 days old go.
- **Never the same job twice.** `AlertMatch` is unique per (seeker, job), even when two of their alerts match it.
- **Free, limited by plan.** Free 3 roles / 5 companies, Pro 10 / 25, Max 20 / 50 (`ALERT_LIMITS`). After a downgrade, the oldest alerts within the new limit keep working.

## How jobs reach alerts

1. **Any job entering the shared index from a public source** is matched: any seeker's search or the backfill. So one seeker's search feeds another's alerts. A match stores only the job, never whose search found it. A link a seeker pasted (source `MANUAL`) is never matched or shown to anyone else: its title and company come from that page, and it may be a private link. `AlertMatcherService` walks `Job.created_at` from a cursor every 15 minutes.
2. **A new alert** is seeded with matches from the last 3 days of the index, so the first digest isn't empty.
3. **Backfill**, every 6 hours, free sources only. It searches the open feeds and Workable for every alerted role, and fetches the Greenhouse, Lever and Ashby boards of followed companies we already know. No Apify, no tokens spent.

## Pieces

| | |
|---|---|
| `insights/alert-rules.ts` | Matching, limits, cadence, the send verdict, the headline (pure) |
| `insights/alert-matcher.service.ts` | Index → `AlertMatch` |
| `insights/digest.service.ts` | Hourly: due seekers → checks → `AlertDigest` + bus notification + email |
| `insights/backfill.service.ts` | Free sources → index |
| `insights/digest-email.ts` | The email (HTML + text, top 10, "N more") |
| `insights/insights.service.ts` / `.controller.ts` | `job-seeker/insights` CRUD, settings, digests, company search; `POST insights/unsubscribe` (no login, token) |
| `mail/mail.service.ts` | SendGrid v3 over HTTPS (no SDK) |
| `notifications/notification-factory.ts` | `alertNotification`: digests appear in the feed as kind `alert` |

## Environment

| Variable | |
|---|---|
| `SENDGRID_API_KEY` | SendGrid key with Mail Send permission only. Without it (or `MAIL_FROM`), alerts are in-app only and the page says email is coming soon. |
| `MAIL_FROM` | A sender on a domain verified in SendGrid (SPF/DKIM), e.g. `alerts@plato…` |
| `MAIL_FROM_NAME` | Default `Plato` |
| `FRONTEND_URL` | Links in the email (`/insights`, `/unsubscribe?token=`) |
| `API_PUBLIC_URL` | Optional. Enables the one-click `List-Unsubscribe` header (Gmail/Apple Mail button). |
| `INSIGHTS_JOBS=off` | Stops the matcher, digest and backfill timers (e.g. on extra instances) |

After pulling: `npm run prisma:generate` and `npm run prisma:push` (new collections and a `jobs.created_at` index).

ponytail: timers run in-process. With more than one API instance, run them on one only (`INSIGHTS_JOBS=off` elsewhere), or move them to a queue.
