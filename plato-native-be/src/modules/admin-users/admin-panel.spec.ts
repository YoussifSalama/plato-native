jest.mock('@nestjs/config', () => ({ ConfigService: class {} })); // ESM-only
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forgetSessions, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { allPlans, allTopups, planOf, setCatalog } from '../credits/credit-prices';
import { capData, explain, redact } from '../error-log/error-log';
import { ErrorLogService } from '../error-log/error-log.service';
import {
  clearRateLimitsFor,
  listRateLimits,
  RateLimiter,
  rateLimiters,
} from '../extension/extension-token';
import { PrismaService } from '../prisma/prisma.service';
import { parseSort, providerOf } from '../usage/usage-stats';
import { AdminRateLimitsController } from './admin-users.controller';

// Admin panel pieces the HANDOFF asked to pin down with tests.

describe('providerOf', () => {
  it.each([
    [{ model: 'claude-sonnet-4' }, 'anthropic'],
    [{ model: 'gpt-4o-mini' }, 'openai'],
    [{ model: 'o3-mini' }, 'openai'],
    [{ model: 'text-embedding-3-small' }, 'openai'],
    [{ model: 'gpt-realtime' }, 'openai'],
    [{ model: 'apify~linkedin-jobs', apify_usd: 0 }, 'apify'], // a failed run is still Apify's
    [{ model: null, apify_usd: 0.4 }, 'apify'],
    [{ model: null, feature: 'discovery.apify' }, 'apify'],
    [{ model: 'mystery-model' }, 'other'],
    [{}, 'other'],
  ])('%j → %s', (row, provider) => {
    expect(providerOf(row)).toBe(provider);
  });
});

describe('parseSort', () => {
  const F = ['createdAt', 'email'] as const;
  it('reads field and -field, and falls back on anything else', () => {
    expect(parseSort('email', F, '-createdAt')).toEqual({ field: 'email', desc: false });
    expect(parseSort('-email', F, '-createdAt')).toEqual({ field: 'email', desc: true });
    expect(parseSort('password', F, '-createdAt')).toEqual({ field: 'createdAt', desc: true });
    expect(parseSort(undefined, F, 'createdAt')).toEqual({ field: 'createdAt', desc: false });
  });
});

describe('plans catalog', () => {
  afterEach(() => setCatalog([]));

  it('with no stored rows it is the defaults', () => {
    setCatalog([]);
    expect(Object.keys(allPlans())).toEqual(expect.arrayContaining(['free', 'pro', 'max']));
    expect(allPlans().pro.active).toBe(true);
    expect(Object.keys(allTopups()).length).toBeGreaterThan(0);
  });

  it('a stored row overrides its default, adds new keys, and free stays free and on', () => {
    setCatalog([
      { key: 'pro', kind: 'plan', label: 'Pro+', tokens: 1234, price_usd: 25, active: false },
      { key: 'team', kind: 'plan', label: 'Team', tokens: 9000, price_usd: 99, active: true },
      { key: 'free', kind: 'plan', label: 'Free', tokens: 10, price_usd: 5, active: false },
    ]);
    expect(allPlans().pro).toEqual({ label: 'Pro+', monthly: 1234, priceUsd: 25, active: false });
    expect(planOf('team').priceUsd).toBe(99);
    expect(allPlans().free.priceUsd).toBe(0);
    expect(allPlans().free.active).toBe(true);
    // an unknown plan reads as free
    expect(planOf('gone')).toBe(allPlans().free);
  });
});

describe('error log redaction', () => {
  it('drops secrets at any depth and by value', () => {
    const out = redact({
      email: 'a@b.c',
      password: 'p',
      superKey: 'k',
      inviteToken: 't',
      nested: { authorization: 'x', api_key: 'y', note: 'Bearer abc', list: [{ secret: 1 }] },
      device: 'plx_abc',
    }) as Record<string, unknown>;
    expect(out).toEqual({
      email: 'a@b.c',
      password: '[redacted]',
      superKey: '[redacted]',
      inviteToken: '[redacted]',
      nested: { authorization: '[redacted]', api_key: '[redacted]', note: '[redacted]', list: [{ secret: '[redacted]' }] },
      device: '[redacted]',
    });
  });

  it('extra keys (a code on auth routes) are dropped, and big data is capped at 8 KB', () => {
    expect(capData({ body: { code: '123456' } }, ['code'])).toEqual({ body: { code: '[redacted]' } });
    const big = capData({ rows: Array.from({ length: 50 }, () => 'x'.repeat(900)) }) as Record<string, unknown>;
    expect(big.truncated).toBe(true);
    expect(JSON.stringify(big).length).toBeLessThan(8 * 1024 + 200);
  });
});

describe('error log explanation', () => {
  const known = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });
  it.each([
    [401, undefined, /No valid session/],
    [402, undefined, /Plato tokens/],
    [403, new ForbiddenException({ code: 'BLOCKED', message: 'b' }), /blocked by an admin/],
    [429, undefined, /Rate limit/],
    [500, known('P2002'), /duplicate/],
    [500, new Error('request to api.openai.com failed: ECONNRESET'), /upstream provider/],
    [500, new Error('operation timed out'), /took too long/],
    [500, new Error('boom'), /Unexpected server error: boom/],
  ])('%s %s', (status, err, re) => {
    expect(explain(status, err)).toMatch(re);
  });

  it('a 401 on a sign-in route reads as a failed sign-in', () => {
    expect(explain(401, undefined, { path: '/admin/auth/login' })).toMatch(/Sign-in failed/);
    expect(explain(401, undefined, { path: '/auth/login' })).toMatch(/Sign-in failed/);
    expect(explain(401, undefined, { path: '/admin/auth/me' })).toMatch(/No valid session/);
  });

  it('a 404 says whether the route exists', () => {
    expect(explain(404, new NotFoundException(), { routed: false })).toMatch(/No such route/);
    expect(explain(404, new NotFoundException(), { routed: true })).toMatch(/not found/);
  });
});

describe('ErrorLogService never throws', () => {
  const svc = (create: jest.Mock) =>
    new ErrorLogService(
      { errorLog: { create }, user: { findUnique: jest.fn() } } as never,
      { values: () => [] } as never,
    );
  const flush = () => new Promise((r) => setImmediate(r));

  it('a failing DB write is swallowed', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    expect(() =>
      svc(create).fromResponse({ method: 'GET', originalUrl: '/x', headers: {}, query: {} } as never, 500),
    ).not.toThrow();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a request that cannot even be read is swallowed', () => {
    const create = jest.fn();
    expect(() => svc(create).fromResponse(null as never, 500)).not.toThrow();
    expect(() => svc(create).client(null as never, 'js1', null as never)).not.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('redacts the TOTP code on admin auth routes', async () => {
    const create = jest.fn().mockResolvedValue({});
    svc(create).fromResponse(
      { method: 'POST', originalUrl: '/admin/auth/totp/verify', headers: {}, query: {}, body: { code: '123456' } } as never,
      401,
    );
    await flush();
    await flush();
    expect(create.mock.calls[0][0].data.data).toEqual({ query: {}, body: { code: '[redacted]' } });
  });
});

describe('JwtAuthGuard and a blocked seeker', () => {
  afterEach(() => {
    PrismaService.instance = undefined;
    forgetSessions('u-blocked');
  });
  it('refuses an existing session with 403 BLOCKED', async () => {
    PrismaService.instance = {
      user: {
        findUnique: async () => ({ sessions_valid_after: null, blocked_at: new Date() }),
      },
    } as never;
    const guard = new JwtAuthGuard({
      verifyAsync: async () => ({ sub: 'u-blocked', iat: Math.floor(Date.now() / 1000) }),
    } as never);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ cookies: { access_token: 'x' } }) }),
    } as never;
    const err = await guard.canActivate(ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: 'BLOCKED' });
  });

  it('refuses an admin token (it carries an audience)', async () => {
    const guard = new JwtAuthGuard({
      verifyAsync: async () => ({ sub: 'u1', aud: 'plato-admin' }),
    } as never);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ cookies: { access_token: 'x' } }) }),
    } as never;
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('rate limits from the admin panel', () => {
  const seeker = new RateLimiter('test-seeker');
  const admin = new RateLimiter('admin-test');
  afterAll(() => {
    rateLimiters.delete(seeker.name);
    rateLimiters.delete(admin.name);
  });
  beforeEach(() => {
    for (const k of ['login:mona@x.io:1.2.3.4', 'login:other@x.io:5.6.7.8', 'dev:abc'])
      seeker.hit(k, 5, 60_000);
    admin.hit('email:mona@x.io', 5, 60_000);
  });
  afterEach(() => {
    for (const l of [seeker, admin]) for (const e of l.entries()) l.reset(e.key);
  });

  it('clears every seeker key tied to the user, email or IP, never an admin sign-in limit', () => {
    expect(clearRateLimitsFor(['mona@x.io', 'abc'])).toBe(2);
    expect(seeker.entries().map((e) => e.key)).toEqual(['login:other@x.io:5.6.7.8']);
    expect(admin.count('email:mona@x.io')).toBe(1);
  });

  it('lists live keys; the admin-* limiters only for the super admin', () => {
    const c = new AdminRateLimitsController();
    const as = (isSuper: boolean) => ({ admin: { isSuper } }) as never;
    const names = (rows: { limiter: string }[]) => new Set(rows.map((r) => r.limiter));
    expect(names(c.list(as(true), 'x.io'))).toEqual(new Set(['test-seeker', 'admin-test']));
    expect(names(c.list(as(false), 'x.io'))).toEqual(new Set(['test-seeker']));
    expect(listRateLimits('abc').map((r) => r.key)).toEqual(['dev:abc']);
  });

  it('DELETE clears one key; an admin-* key needs the super admin', () => {
    const c = new AdminRateLimitsController();
    expect(c.clear({ admin: { isSuper: false } } as never, 'test-seeker', 'dev:abc')).toEqual({ ok: true });
    expect(seeker.count('dev:abc')).toBe(0);
    expect(() => c.clear({ admin: { isSuper: false } } as never, 'admin-test', 'email:mona@x.io')).toThrow(ForbiddenException);
    expect(c.clear({ admin: { isSuper: true } } as never, 'admin-test', 'email:mona@x.io')).toEqual({ ok: true });
  });
});
