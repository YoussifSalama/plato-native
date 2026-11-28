// Types from API_CONTRACT.md. Keep in step with that file (and the backend).

export type PageKey = 'dashboard' | 'usage' | 'plans' | 'credits' | 'users' | 'logs' | 'admin';

export type Me = {
  id: string;
  email: string;
  isSuper: boolean;
  active: boolean;
  role: { id: string; name: string } | null;
  pages: string[];
};

export type AuthNext = { next: 'totp' | 'totp_setup' | 'super_key' | 'pending_activation' };
export type TotpSetup = { otpauthUrl: string; secret: string };
export type Ok = { ok: boolean };

export type Paged<T> = { items: T[]; total: number };

// ---------- Admin section ----------
export type AdminRow = {
  id: string;
  email: string;
  isSuper: boolean;
  active: boolean;
  role: { id: string; name: string } | null;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};
export type Role = { id: string; name: string; pages: string[]; adminCount: number };
export type Invite = {
  id: string;
  email: string;
  role: { id: string; name: string } | null;
  status: 'pending' | 'used' | 'expired';
  expiresAt: string;
  createdAt: string;
};
export type PageInfo = { key: string; label: string };

// ---------- Dashboard ----------
export type Overview = {
  users: { total: number; new: number; verified: number; blocked: number; activeInRange: number };
  costUsd: number;
  revenueUsdMonthly: number;
  byProvider: { provider: string; costUsd: number }[];
  applications: { total: number; submitted: number; failed: number };
  errors: { total: number; platform: { web: number; extension: number; api: number } };
};

// ---------- Usage ----------
export type Provider = 'apify' | 'anthropic' | 'openai' | 'other';
export const PROVIDERS: Provider[] = ['apify', 'anthropic', 'openai', 'other'];

export type FeatureCost = { feature: string; costUsd: number; events: number };
export type UsageOverview = {
  totalCostUsd: number;
  events: number;
  byProvider: { provider: string; costUsd: number; events: number }[];
  byFeature: FeatureCost[];
  byDay: { day: string; costUsd: number; byProvider: Record<string, number> }[];
};
export type ProviderUsage = {
  provider: string;
  totalCostUsd: number;
  events: number;
  byModel: { model: string; costUsd: number; inputTokens: number; outputTokens: number; events: number }[];
  byFeature: FeatureCost[];
  byDay: { day: string; costUsd: number }[];
  topUsers: { userId: string; email: string; costUsd: number; events: number }[];
};
export type UsageUserRow = {
  userId: string;
  email: string;
  name: string | null;
  plan: string;
  costUsd: number;
  events: number;
  tokensSpent: number;
};

// ---------- Plans ----------
export type Plan = {
  key: string;
  kind: 'plan' | 'topup';
  label: string;
  tokens: number;
  priceUsd: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
export type PlansResponse = { items: Plan[]; usdPerToken: number };
export type CalculatorData = {
  usdPerToken: number;
  plans: {
    key: string;
    users: number;
    avgTokensUsed: number;
    p50TokensUsed: number;
    p90TokensUsed: number;
    avgCostUsd: number;
  }[];
  perFeature: { feature: string; avgTokensPerEvent: number; avgCostUsdPerEvent: number }[];
  providerCostShare: { provider: string; share: number }[];
};

// ---------- Credits ----------
// The existing endpoints return Prisma rows (snake_case), see credits.service.ts adminView().
export type CreditAccount = {
  id: string;
  user_id: string;
  plan: string;
  balance: number;
  topup: number;
  period_start: string;
  period_end: string;
  paid_until: string | null;
  unverified?: boolean | null;
  created_at: string;
  updated_at: string;
};
export type CreditLedger = {
  id: string;
  user_id: string;
  kind: string;
  amount: number;
  balance_after: number;
  feature: string | null;
  usage_event_id: string | null;
  settled_at: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};
export type CreditView = { account: CreditAccount; ledger: CreditLedger[] };

// ---------- Users ----------
export type UserStatus = 'all' | 'verified' | 'unverified' | 'blocked';
export type UserRow = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  verified: boolean;
  blocked: boolean;
  plan: string;
  balance: number;
  lastActiveAt: string | null;
  costUsd: number;
};
export type CountBy<K extends string> = { [P in K]: string } & { count: number };
export type UserAnalytics = {
  user: {
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
    verified: boolean;
    blocked: boolean;
    blockedReason: string | null;
    plan: string;
    balance: number;
  };
  activity: {
    lastActiveAt: string | null;
    activeDays: number;
    activeDaysByWeek: { week: string; days: number }[];
    events: number;
  };
  features: FeatureCost[];
  searches: {
    total: number;
    topTitles: CountBy<'title'>[];
    topLocations: CountBy<'location'>[];
  };
  applications: { total: number; byStatus: Record<string, number>; byEngine: Record<string, number> };
  chat: { threads: number; messages: number };
  interviews: number;
  spentTokens: number;
  costUsd: number;
  profile: { headline?: string | null; yearsExperience?: number | null; cvFile?: string | null };
};
export type RateLimit = { limiter: string; key: string; hits: number; resetAt: string | number };

// ---------- Logs ----------
export type Platform = 'web' | 'extension' | 'api';
export type ErrorLog = {
  id: string;
  platform: Platform;
  module: string;
  page?: string | null;
  method: string;
  path: string;
  status: number;
  code?: string | null;
  message: string;
  explanation?: string | null;
  data?: unknown;
  userId?: string | null;
  userEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
};
export type ExtensionLog = ErrorLog & { source: 'client' | 'server' | 'apply' };
export type LogFacets = {
  modules: { module: string; count: number }[];
  statuses: { status: number; count: number }[];
};
export type ExtensionUserRow = {
  userId: string;
  email: string;
  name: string | null;
  errors: number;
  lastAt: string;
  topCodes: { code: string; count: number }[];
};
export type ExtensionUserLogs = {
  user: { id: string; email: string; name?: string | null } | null;
  items: ExtensionLog[];
  total: number;
};
