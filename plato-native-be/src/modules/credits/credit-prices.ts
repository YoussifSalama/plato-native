// Plato tokens: one unit for everything a seeker spends. A service costs what it
// really costs us, converted at one rate, so a gpt-4o call costs more tokens than
// the same text on gpt-4.1-nano, and a Glassdoor result more than a Talent one.
// The margin lives in the plan prices, not here.

/** One Plato token = this many US dollars of our cost (1,000 tokens = $1). */
export const USD_PER_TOKEN = Number(process.env.CREDITS_USD_PER_TOKEN ?? 0.001);

// Monthly tokens per plan. Starting points from MEASURED_COSTS.md (Pro $19 with
// about $7 of cost, Max $59 with about $25): the plan price is where the margin is.
// Defaults only: a row in the plans collection (admin panel) overrides its key.
export const DEFAULT_PLANS: Record<
  string,
  { label: string; monthly: number; priceUsd: number }
> = {
  free: {
    label: 'Free',
    monthly: Number(process.env.CREDITS_FREE_MONTHLY ?? 1000),
    priceUsd: 0,
  },
  pro: {
    label: 'Pro',
    monthly: Number(process.env.CREDITS_PRO_MONTHLY ?? 7000),
    priceUsd: Number(process.env.CREDITS_PRO_PRICE_USD ?? 19),
  },
  max: {
    label: 'Max',
    monthly: Number(process.env.CREDITS_MAX_MONTHLY ?? 25000),
    priceUsd: Number(process.env.CREDITS_MAX_PRICE_USD ?? 59),
  },
};

// One-time packs of extra tokens. They cost more per token than a plan (a plan is
// the better deal for steady use) and never expire.
export const DEFAULT_TOPUPS: Record<
  string,
  { label: string; tokens: number; priceUsd: number }
> = {
  small: {
    label: 'Small',
    tokens: 1000,
    priceUsd: Number(process.env.CREDITS_TOPUP_SMALL_USD ?? 5),
  },
  medium: {
    label: 'Medium',
    tokens: 3000,
    priceUsd: Number(process.env.CREDITS_TOPUP_MEDIUM_USD ?? 12),
  },
  large: {
    label: 'Large',
    tokens: 10000,
    priceUsd: Number(process.env.CREDITS_TOPUP_LARGE_USD ?? 35),
  },
};

export type PlanInfo = {
  label: string;
  monthly: number;
  priceUsd: number;
  active: boolean;
};
export type TopupInfo = {
  label: string;
  tokens: number;
  priceUsd: number;
  active: boolean;
};
export type PlanRow = {
  key: string;
  kind: string;
  label: string;
  tokens: number;
  price_usd: number;
  active: boolean;
};

// The live catalog: the defaults with the plans collection laid over them.
// PlansService loads it at boot and after every admin write; until then (and in
// unit tests) it is the defaults. Free can never be switched off or priced.
let catalog = buildCatalog([]);

export function buildCatalog(rows: PlanRow[]) {
  const plans: Record<string, PlanInfo> = {};
  const topups: Record<string, TopupInfo> = {};
  for (const [k, p] of Object.entries(DEFAULT_PLANS))
    plans[k] = { ...p, active: true };
  for (const [k, t] of Object.entries(DEFAULT_TOPUPS))
    topups[k] = { ...t, active: true };
  for (const r of rows)
    if (r.kind === 'topup')
      topups[r.key] = {
        label: r.label,
        tokens: r.tokens,
        priceUsd: r.price_usd,
        active: r.active,
      };
    else
      plans[r.key] = {
        label: r.label,
        monthly: r.tokens,
        priceUsd: r.price_usd,
        active: r.active,
      };
  plans.free = { ...plans.free, priceUsd: 0, active: true };
  return { plans, topups };
}

export function setCatalog(rows: PlanRow[]) {
  catalog = buildCatalog(rows);
}

/** Every plan, active or not (accounts on a switched-off plan keep it). */
export const allPlans = () => catalog.plans;
export const allTopups = () => catalog.topups;
/** What is on sale. */
export const activePlans = () =>
  Object.fromEntries(Object.entries(catalog.plans).filter(([, p]) => p.active));
export const activeTopups = () =>
  Object.fromEntries(Object.entries(catalog.topups).filter(([, t]) => t.active));
export const planOf = (plan: string) => catalog.plans[plan] ?? catalog.plans.free;
export const topupOf = (pack: string): TopupInfo | undefined =>
  catalog.topups[pack];

// A voice interview runs browser <-> OpenAI, so the server never sees its tokens
// directly. It is reserved per minute at this ceiling when the call starts and
// settled against the server's own clock (never more than the ceiling).
// ponytail: a ceiling, not a measurement; set it from real career.voice rows.
export const VOICE_USD_PER_MINUTE = Number(
  process.env.CREDITS_VOICE_USD_PER_MINUTE ?? 0.1,
);

// Auto apply is not charged in tokens (out of scope for this system). Nor are the
// sub-token AI steps that keep a form working with an empty balance: reading the
// search sentence, planning its titles, the first preference suggestion, a quiz
// attempt's summary (a 402 there would lose the form or the attempt).
const EXEMPT = /^(extension|apply)\./;
const FREE = new Set([
  'discovery.sentence',
  'discovery.titles',
  'onboarding.preferences',
  'quiz.summary',
]);

// Apify boards: a fixed price per platform, so the cost of a search is known
// before it runs. USD per result + per run start (the actors' own pay-per-result
// pricing, free tier; DISCOVERY_COST_REPORT.md). A board not listed here is
// charged what Apify reported for the run.
export const APIFY_PRICES: Record<
  string,
  { label: string; perResult: number; perRun: number }
> = {
  'cirkit~talent-com-jobs-scraper': {
    label: 'Talent.com',
    perResult: 0.0007,
    perRun: 0,
  },
  'parsebird~jobbank-canada-scraper': {
    label: 'Job Bank',
    perResult: 0.00079,
    perRun: 0,
  },
  'parsebird~dice-jobs-scraper': {
    label: 'Dice',
    perResult: 0.00099,
    perRun: 0,
  },
  'memo23~handshake-jobs-scraper': {
    label: 'Handshake',
    perResult: 0.001,
    perRun: 0,
  },
  'curious_coder~linkedin-jobs-scraper': {
    label: 'LinkedIn',
    perResult: 0.001,
    perRun: 0,
  },
  'automation-lab~wuzzuf-jobs-scraper': {
    label: 'Wuzzuf',
    perResult: 0.00092,
    perRun: 0.005,
  },
  'scrapesage~google-jobs-scraper': {
    label: 'Google Jobs',
    perResult: 0.0022,
    perRun: 0,
  },
  'jobsapi~jobillico-jobs-search-scraper': {
    label: 'Jobillico',
    perResult: 0.00299,
    perRun: 0,
  },
  'benthepythondev~builtin-jobs-scraper': {
    label: 'Built In',
    perResult: 0.003,
    perRun: 0,
  },
  'automation-lab~indeed-scraper': {
    label: 'Indeed',
    perResult: 0.003,
    perRun: 0.005,
  },
  'agentx~ziprecruiter-jobs-scraper': {
    label: 'ZipRecruiter',
    perResult: 0.0041,
    perRun: 0.01,
  },
  'automation-lab~glassdoor-jobs-scraper': {
    label: 'Glassdoor',
    perResult: 0.005,
    perRun: 0.01,
  },
};

const round = (n: number) => Math.round(n * 1000) / 1000;

// A deep search plans at most as many board results as the dearest board's price
// allows, after a reserve for the boards' start fees: a small balance gets a
// smaller search, not a refusal. The guarantee is per run (ApifyService): each one
// reserves its worst case first and is skipped when that does not fit.
const DEAREST_RESULT = Math.max(
  ...Object.values(APIFY_PRICES).map((p) => p.perResult),
);
const RUN_FEE_RESERVE = 50; // tokens
export function affordableResults(balance: number, wanted: number): number {
  const n = Math.floor(
    (balance - RUN_FEE_RESERVE) / (DEAREST_RESULT / USD_PER_TOKEN),
  );
  return Math.max(0, Math.min(wanted, n));
}
export const toTokens = (usd: number) => round(usd / USD_PER_TOKEN);

/** The most one run of an actor can cost in tokens, asking for `limit` results. */
export function runCeiling(actorId: string, limit: number) {
  const p = APIFY_PRICES[actorId];
  // an actor without a fixed price is charged what Apify reports: reserve the dearest board's rate
  return toTokens(
    p ? p.perRun + p.perResult * limit : 0.01 + DEAREST_RESULT * limit,
  );
}

export interface MeteredRow {
  feature: string;
  model?: string | null;
  cost_usd?: number | null;
  apify_usd?: number | null;
  meta?: unknown;
}

/** Plato tokens one usage event costs the seeker (0 = free). */
export function tokensFor(r: MeteredRow): number {
  if (EXEMPT.test(r.feature) || FREE.has(r.feature)) return 0;
  if (r.feature === 'discovery.apify') {
    const results = (r.meta as { results?: unknown } | null)?.results;
    // a failed run (no results read) or an empty one costs the seeker nothing; we still paid Apify (usage_events)
    if (typeof results !== 'number' || results <= 0) return 0;
    const price = r.model ? APIFY_PRICES[r.model] : undefined;
    return toTokens(
      price
        ? price.perRun + price.perResult * results
        : (r.apify_usd ?? r.cost_usd ?? 0),
    );
  }
  return toTokens(r.cost_usd ?? 0);
}

// What the seeker sees in their history, per metered feature.
export const FEATURE_LABELS: Record<string, string> = {
  'onboarding.extract': 'Reading your CV',
  'onboarding.preferences': 'Setting your preferences',
  'chat.onboarding': 'Onboarding chat',
  'chat.orchestrator': 'Job search chat',
  'discovery.titles': 'Planning a search',
  'discovery.country': 'Planning a search',
  'discovery.apify': 'Searching job boards',
  'career.chat': 'Career chat',
  'career.research': 'Career research',
  'career.research.search': 'Career research (web search)',
  'career.voice': 'Voice interview',
  'career.voice.score': 'Voice interview scorecard',
  'resume.write': 'Writing a resume',
  'resume.analyze': 'Checking a resume against a job',
  'interview.plan': 'Mock interview',
  'interview.followup': 'Mock interview',
  'interview.coach': 'Mock interview coaching',
  'interview.score': 'Mock interview feedback',
  'discovery.sentence': 'Reading your search',
  'discovery.fit': 'Checking a search against your profile',
  'discovery.fantastic': 'Searching job boards',
  'quiz.understand': 'Building a practice quiz',
  'quiz.plan': 'Building a practice quiz',
  'quiz.section': 'Building a practice quiz',
  'quiz.summary': 'Practice quiz summary',
  'assessments.report': 'Candidate report',
  'guest.preferences': 'Setting your preferences',
};

// The kind of work a feature is, for the spending breakdown (the app has the icons).
export function categoryOf(feature: string | null) {
  const f = feature ?? '';
  if (/^(chat\.orchestrator|discovery\.)/.test(f)) return 'search';
  if (/^career\.voice/.test(f)) return 'voice';
  if (/^career\./.test(f)) return 'career';
  if (/^resume\./.test(f)) return 'resume';
  if (/^interview\./.test(f)) return 'interview';
  if (/^(quiz|assessments)\./.test(f)) return 'practice';
  if (/^(onboarding\.|chat\.onboarding|guest\.)/.test(f)) return 'profile';
  return 'other';
}
