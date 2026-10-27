<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Concept — Plato

Plato is an AI-native candidate platform (a Recruiter-like site, but AI-first — the chat is the UI, not a bolt-on feature).

**Flow:**

1. **Onboarding** — user signs up on Plato to build a profile in our system.
2. **Snapshot + chat** — the profile builds a snapshot of the candidate. The user chats with the AI native about the jobs they want, until the AI has gathered enough data to make a decision.
3. **Discovery** — the AI automatically starts scraping/discovering jobs from a curated list of sites chosen by the business owner (LinkedIn, Workable, USAJobs, Google for Jobs, Indeed, etc.).
4. **Pipeline (multi-layer)** — discovered jobs pass through layers:
   - classification
   - remaining/filtering
   - ranking against the user's snapshot (AI-assisted)

   Example: 10,000 jobs → classified into ~1,000 → AI refines/ranks → ~20–30 best matches, delivered in the chat in real time.

5. **Results in chat** — matches show up as chat results, split into two groups:
   - **Auto-apply** — jobs with public application endpoints/links, applied directly.
   - **Agent-apply** — jobs that need the user's LinkedIn/Indeed account access; applied via the AI orchestrator's browser agent, acting on the user's behalf.

**AI provider:** OpenAI (GPT models) is the orchestrator/handler agent behind the AI-native layer.

This is the core function. The full application will have more around it, but this pipeline — profile → snapshot → chat-driven job discovery → ranked results → auto/agent apply — is the core loop.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Costs & pricing

Every LLM run and Apify run is logged to the `usage_events` collection
(feature, model, tokens, `apify_usd`, user). Apply the schema once with
`npm run prisma:push`.

Measured on one real session (onboarding + search + resume, 1 user, 1 CV):
about **$0.06 of LLM cost** in total (onboarding $0.024, search chat $0.016,
resume $0.021). A search the local index covers costs **$0 Apify**; one it
does not cover costs **about $3 Apify** (observed). Fixed: Hostinger KVM 4
16 GB about $29 per month; Cloudflare R2 about $0 under 10 GB.

**Billing: charge per search, guard on tokens.** Apify dominates variable cost
and it is per search, so sell **standard searches** (index-covered, about
$0.02, unlimited / fair use) and **deep searches** (Apify, about $3, counted
and limited per plan). Do not charge by tokens; keep a hidden per-plan LLM
dollar cap against abuse. Starter plans: Free 0 deep, Pro 2 deep at $19, Max 8
deep at $59, top-up $6 per deep search.

Details, prices, sources and assumptions:
- [MEASURED_COSTS.md](MEASURED_COSTS.md): measured numbers, infra, billing metric
- [COST_AND_PRICING.md](COST_AND_PRICING.md): per-feature estimates (its plan table is superseded)
- [DISCOVERY_COST_REPORT.md](DISCOVERY_COST_REPORT.md), [DISCOVERY_COST_TRADEOFFS.md](DISCOVERY_COST_TRADEOFFS.md): Apify per platform and cost levers

## Deployment

Settings: copy `.env.example` to `.env`. The API checks its settings at boot and, if anything required is missing or malformed, stops with one message naming each problem (never the values).

Error monitoring: set `SENTRY_DSN` (and optionally `SENTRY_ENVIRONMENT`) and unexpected errors (5xx, crashes) are reported to Sentry. Request bodies, cookies, query strings, auth headers and user details are stripped first (`src/instrument.ts`). Without a DSN nothing is sent.

Security settings for production:

- `TRUST_PROXY`: set it when the API runs behind a proxy or load balancer (`1` for one hop). Without it, every visitor looks like the proxy's address, and the login, sign-up and extension pairing limits apply to all of them together.
- Rate limits (in memory, per process): login 10 attempts per account per 15 minutes and 30 per address per minute; sign-up 10 per address per 10 minutes; extension pairing as before.
- Protective HTTP headers come from `helmet` (no CSP: JSON API).
- Password reset and email confirmation send one-time links through SendGrid (`SENDGRID_API_KEY`, `MAIL_FROM`; see INSIGHTS.md) to `FRONTEND_URL`. Links store only a hash, expire (reset 1 hour, confirmation 3 days) and work once. A reset signs out every session issued before it (checked in `JwtAuthGuard`, cached 60 s). Forgot-password: 3 per account per hour.

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
