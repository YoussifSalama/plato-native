// What the mocked API answers, by path: just enough for every page to render (shapes from
// src/lib/types.ts). A path with no fixture answers an empty page.
const ID = '6650aaaaaaaaaaaaaaaaaaaa';
const day = '2026-11-20';
const iso = '2026-11-20T10:00:00.000Z';
const emptyPage = { items: [], total: 0 };
const summary = {
  searches: 1, done: 1, failed: 0, running: 0, searchers: 1, searchesPerSearcher: 1, totalCostUsd: 0.2, totalTokens: 300,
  avgCostUsd: 0.2, p50CostUsd: 0.2, p90CostUsd: 0.2, avgTokens: 300, avgDurationSec: 90, p50DurationSec: 90, p90DurationSec: 90,
  avgFetched: 100, avgShortlisted: 10, costPerShortlistedUsd: 0.02, estimated: 0,
};
const user = { id: ID, name: 'Mona Test', email: 'mona@example.com', createdAt: iso, verified: true, blocked: false, plan: 'pro', balance: 1200, lastActiveAt: iso, costUsd: 3.2 };
const search = { id: 'r1', userId: ID, email: user.email, name: user.name, plan: 'pro', startedAt: iso, finishedAt: iso, durationSec: 90, status: 'DONE', fetched: 100, shortlisted: 10, costUsd: 0.2, tokens: 300, events: 4, byProvider: { apify: 0.15, openai: 0.05 }, attribution: 'exact' };
const log = { id: 'l1', platform: 'web', module: 'chat', page: '/chat', method: 'POST', path: '/chat/x', status: 502, code: null, message: 'Upstream failed', explanation: 'An upstream provider failed.', data: { body: {} }, userId: ID, userEmail: user.email, ip: '1.2.3.4', userAgent: 'x', createdAt: iso };
const period = { signups: 1, active: 1, costUsd: 3, applications: { total: 1, submitted: 1, failed: 0 }, errors: { server: 1, outOfTokens: 0, client: 2, extension: 0 }, searches: { total: 1, avgCostUsd: 0.2, avgTokens: 300, avgDurationSec: 90 }, perActiveUser: { costUsd: 3, tokens: 400 } };

export const fixtures: [RegExp, unknown][] = [
  [/^\/admin\/auth\/me$/, { id: 'a1', email: 'owner@example.com', isSuper: true, active: true, role: null, pages: ['dashboard', 'usage', 'plans', 'credits', 'users', 'logs', 'admin'] }],
  [/^\/admin\/overview$/, {
    users: { total: 5, new: 1, verified: 4, blocked: 0, activeInRange: 1 },
    revenue: { plansMonthlyUsd: 19, paidUsers: 1, paymentsConnected: false },
    costUsd: 3, costMonthlyRunRateUsd: 3, byProvider: [{ provider: 'apify', costUsd: 2 }],
    applications: period.applications, errors: period.errors, perActiveUser: period.perActiveUser, searches: period.searches,
    previous: { from: iso, to: iso, ...period },
    changes: { signups: 0.1, active: null, costUsd: -0.2, searches: 0, avgSearchCostUsd: null, avgSearchSec: null, costPerActiveUser: null, applications: null, serverErrors: 1 },
    byDay: [{ day, signups: 1, active: 1, costUsd: 3, searches: 1 }],
    funnel: [{ key: 'signup', label: 'Signed up', count: 1, ofSignups: 1, ofPrevious: null }],
    topUsers: [{ userId: ID, email: user.email, name: user.name, plan: 'pro', costUsd: 3, priceUsd: 19 }],
  }],
  [/^\/admin\/attention$/, [{ kind: 'stuck', severity: 'high', title: '1 search stuck', detail: 'x', link: '/usage/searches' }]],
  [/^\/admin\/retention$/, [{ week: day, users: 1, weeks: [1] }]],
  [/^\/admin\/usage\/overview$/, { totalCostUsd: 3, events: 4, byProvider: [{ provider: 'apify', costUsd: 2, events: 2 }], byFeature: [{ feature: 'discovery.apify', costUsd: 2, events: 2 }], byDay: [{ day, costUsd: 3, byProvider: { apify: 2 } }] }],
  [/^\/admin\/usage\/providers\/\w+$/, { provider: 'apify', totalCostUsd: 2, events: 2, byModel: [], byFeature: [], byDay: [{ day, costUsd: 2 }], topUsers: [] }],
  [/^\/admin\/usage\/searches$/, { summary, items: [search], total: 1 }],
  [/^\/admin\/plans\/calculator$/, { usdPerToken: 0.001, plans: [], perFeature: [], providerCostShare: [] }],
  [/^\/admin\/plans$/, { items: [{ key: 'pro', kind: 'plan', label: 'Pro', tokens: 7000, priceUsd: 19, active: true, createdAt: null, updatedAt: null }], usdPerToken: 0.001 }],
  [/^\/admin\/credits\/ledger$/, { items: [{ id: 'c1', user_id: ID, email: user.email, name: user.name, kind: 'consume', amount: -12, balance_after: 100, feature: 'chat', usage_event_id: null, settled_at: null, meta: null, created_at: iso }], total: 1, totals: [{ kind: 'consume', amount: -12, count: 1 }] }],
  [/^\/admin\/credits\/[^/]+\/ledger$/, emptyPage],
  [/^\/admin\/credits\/[^/]+$/, { account: { id: 'acc', user_id: ID, plan: 'pro', balance: 1200, topup: 0, period_start: iso, period_end: iso, paid_until: null, created_at: iso, updated_at: iso }, ledger: [] }],
  [/^\/admin\/users$/, { items: [user], total: 1 }],
  [/^\/admin\/users\/\w+\/analytics$/, {
    user: { ...user, blockedReason: null },
    activity: { lastActiveAt: iso, activeDays: 3, activeDaysByWeek: [], events: 4 },
    features: [{ feature: 'chat', events: 2, costUsd: 1 }],
    searches: { total: 1 },
    applications: { total: 1, byStatus: { SUBMITTED: 1 }, byEngine: { EXTENSION: 1 } },
    chat: { threads: 1, messages: 2 }, interviews: 0, spentTokens: 300, costUsd: 3, profile: {},
  }],
  [/^\/admin\/users\/\w+\/engagement$/, {
    user: { id: ID }, trackedSince: day,
    timeInApp: { seconds: 600, activeDays: 2, avgSecondsPerActiveDay: 300, byDay: [{ day, seconds: 600, views: 4 }] },
    pages: [{ page: '/jobs', views: 4, seconds: 600 }],
    planFit: { plan: 'pro', grant: 7000, priceUsd: 19, periodStart: iso, periodEnd: iso, used: 300, toppedUp: 0, balance: 1200, usedPct: 4.3, projected: 900, projectedPct: 12.9, ranOut: 0, daysLeft: 20, verdict: 'enough', advice: 'The plan covers them.' },
    errors: { web: 1 },
    cost: { costUsd: 3, avgActiveUserCostUsd: 3, vsAverage: 1 },
  }],
  [/^\/admin\/rate-limits$/, []],
  [/^\/admin\/logs\/groups$/, { startedAt: iso, items: [{ platform: 'web', module: 'chat', status: 502, code: null, message: 'Upstream failed', count: 3, firstAt: iso, lastAt: iso, isNew: true, sampleId: 'l1', method: 'POST', path: '/chat/x', explanation: 'An upstream provider failed.' }], total: 1 }],
  [/^\/admin\/logs\/facets$/, { modules: [{ module: 'chat', count: 3 }], statuses: [{ status: 502, count: 3 }] }],
  [/^\/admin\/logs\/extension\/users\/\w+$/, { user: { id: ID, email: user.email, name: user.name }, items: [], total: 0 }],
  [/^\/admin\/logs\/extension\/users$/, { items: [{ userId: ID, email: user.email, name: user.name, errors: 2, lastAt: iso, topCodes: [{ code: '429', count: 2 }] }], total: 1 }],
  [/^\/admin\/logs\/extension\/all$/, { items: [{ ...log, platform: 'extension', source: 'client' }], total: 1 }],
  [/^\/admin\/logs$/, { items: [log], total: 1 }],
  [/^\/admin\/admins$/, [{ id: 'a1', email: 'owner@example.com', isSuper: true, active: true, role: null, totpEnabled: true, createdAt: iso, lastLoginAt: iso }]],
  [/^\/admin\/roles$/, [{ id: 'r1', name: 'Support', pages: ['users'], adminCount: 0 }]],
  [/^\/admin\/invites$/, []],
  [/^\/admin\/pages$/, [{ key: 'users', label: 'Users' }]],
  [/^\/admin\/audit$/, { items: [{ id: 'au1', adminId: 'a1', adminEmail: 'owner@example.com', action: 'POST /admin/users/:id/block', target: { id: ID }, detail: { reason: 'x' }, ip: '1.2.3.4', createdAt: iso }], total: 1 }],
];

export const USER_ID = ID;
