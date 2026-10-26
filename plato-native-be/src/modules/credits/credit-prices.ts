// Plato tokens: one unit for everything a seeker spends. A service costs what it
// really costs us, converted at one rate, so a gpt-4o call costs more tokens than
// the same text on gpt-4.1-nano, and a Glassdoor result more than a Talent one.
// The margin lives in the plan prices, not here.

/** One Plato token = this many US dollars of our cost (1,000 tokens = $1). */
export const USD_PER_TOKEN = Number(process.env.CREDITS_USD_PER_TOKEN ?? 0.001);

// Monthly tokens per plan. Starting points from MEASURED_COSTS.md (Pro $19 with
// about $7 of cost, Max $59 with about $25): the plan price is where the margin is.
export const PLANS: Record<
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
export const planOf = (plan: string) => PLANS[plan] ?? PLANS.free;

// A voice interview runs browser <-> OpenAI, so the server never sees its tokens
// directly. It is reserved per minute at this ceiling when the call starts and
// settled against the server's own clock (never more than the ceiling).
// ponytail: a ceiling, not a measurement; set it from real career.voice rows.
export const VOICE_USD_PER_MINUTE = Number(
  process.env.CREDITS_VOICE_USD_PER_MINUTE ?? 0.1,
);

// Auto apply is not charged in tokens (out of scope for this system).
const EXEMPT = /^(extension|apply)\./;

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

// A deep search never spends more than the balance: it asks for at most as many
// board results as the dearest board's price allows, after a reserve for the
// boards' start fees. A small balance gets a smaller search, not a refusal.
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

export interface MeteredRow {
  feature: string;
  model?: string | null;
  cost_usd?: number | null;
  apify_usd?: number | null;
  meta?: unknown;
}

/** Plato tokens one usage event costs the seeker (0 = free). */
export function tokensFor(r: MeteredRow): number {
  if (EXEMPT.test(r.feature)) return 0;
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
  'resume.write': 'Writing a resume',
  'resume.analyze': 'Checking a resume against a job',
  'interview.plan': 'Mock interview',
  'interview.followup': 'Mock interview',
  'interview.score': 'Mock interview feedback',
};
