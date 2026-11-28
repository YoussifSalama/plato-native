# Admin panel — what to add next

Recommendations for the owner, ordered by value. Each item says what data Plato already has, so the
cost of building it is clear. "Have" = stored today; "Need" = must be recorded first.

## Already there (2026-11-28)

Dashboard, Usage & cost (per provider, feature, user, **per search**), Plans + live calculator, Credits,
Users (list, analytics, **time in app, pages used, plan fit, their searches**), Rate limits, Logs (web,
extension, per user), Team (admins, roles, invites, TOTP).

## 1. Money (do first)

1. **Margin by plan and by user.** For each plan: users on it, revenue, our cost, margin, and the users who
   cost more than they pay (cost > plan price). *Have*: cost per user, plan per user. Small.
2. **Cost alerts.** An email when a day's spend jumps (e.g. > 2× the 7-day average), when one user costs > 5× the
   average, or when a provider passes a monthly budget. *Have*: usage events, mail. Small.
3. **Month-end forecast.** Cost and revenue projected to the end of the month at the current pace. *Have*. Small.
4. **Token economy.** Tokens granted vs spent vs expired each month (breakage), top-ups bought, how many users
   hit zero. *Have*: ledger. Small.
5. **Real revenue** (MRR, churn, ARPU, LTV, refunds). *Need*: a payment provider (`PAYMENTS_PROVIDER` is empty;
   paid plans are set by hand today). Medium, after payments.
6. **Provider bill check.** Our metered cost vs what Apify / OpenAI / Anthropic actually billed each month, to
   catch metering gaps. *Need*: their billing APIs. Medium.

## 2. Growth and product

7. **Funnel.** Signed up → verified email → onboarding done → first search → first application → interview, with
   drop-off at each step, per signup week. *Have* all of it. Medium. The single most useful growth view.
8. **Retention cohorts.** Of the people who signed up in week N, how many are still active 1, 2, 4, 8 weeks later.
   *Have*: page activity (from now on), usage events, searches. Small.
9. **Feature adoption.** Share of active users who used each feature (search, career, interview, extension,
   insights) and how often. *Have*. Small.
10. **Search quality.** Per search: jobs kept, then saved, hidden and applied to; zero-result searches; searches
    that led to an application. Tells whether a search is worth what it costs. *Have*: matches (saved, hidden),
    applications. Medium.
11. **Job sources.** Per board: jobs fetched, kept, cost, failures, cost per kept job, freshness. Shows which paid
    boards earn their price. *Have*: run progress per source, Apify cost. Medium.
12. **Auto-apply report.** Success rate by site/ATS, failure reasons (`failure_kind`), human checks, time per
    application, extension versions in use. *Have*. Medium. (On the owner's list.)
13. **Outcomes.** Interviews and offers the seekers report, per week and per plan: the number that proves Plato
    works. *Have*: application outcome. Small.

## 3. Reliability and logs

14. **Error groups.** Group identical errors (same route, code, message), with first/last seen, count trend, and
    "new since the last deploy". An email on a 5xx spike. *Have*: error log. Medium.
15. **Slow endpoints.** p50/p95 response time per route, from the same middleware that logs errors. *Need*: record
    durations. Small.
16. **Background jobs health.** Searches stuck in RUNNING, apply queue length, alert digests sent/failed, last run
    of each timer. *Have* most. Small.
17. **Real-user speed.** The web app already measures load times (Web Vitals) but keeps them in the browser; send
    them to the backend and chart them per page. *Need*: one endpoint. Small.

## 4. Customers and support

18. **Feedback inbox.** An in-app "Report a problem / idea" (with the page it came from) and a short rating after a
    search or an application, read in the panel. *Need*: the form and a collection. Medium.
19. **Support notes and tags** on each user (e.g. "VIP", "refund given"), visible to every admin. Small.
20. **Message users.** Email one user or a segment (plan, inactive for 14 days), and an in-app announcement banner.
    *Have*: mail. Medium.

## 5. Control and security

21. **Admin audit log.** Who did what, when: block, credits adjust, plan change, role edit, invite. Today only
    credit writes record the admin. Small, and important before more admins join.
22. **CSV export** on every table (users, searches, logs, ledger). Small.
23. **Feature flags per plan.** Turn a feature on/off or limit it per plan from the panel. Medium.
24. **Content** (quizzes, interview sets, alert templates). On the owner's list. Medium.

## Suggested order

Margin by plan (1) → funnel (7) → retention (8) → search quality and sources (10, 11) → admin audit log (21) →
cost alerts (2) → auto-apply report (12) → error groups (14).
