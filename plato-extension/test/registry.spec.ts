import { describe, expect, it } from 'vitest';
import { DEFINITIONS } from '../src/providers/definitions';
import type { ProviderDefinition } from '../src/providers/types';
import { fixtureProvider } from '../src/providers/fixture';
import { isAllowedPattern, matchesPattern } from '../src/providers/match';
import { createRegistry, effectivePolicy } from '../src/providers/registry';

// The shipped definitions are enabled now. These tests pin the GATE's behaviour, so they run on a
// copy with every provider switched off; the next block checks what actually ships.
const off = (d: ProviderDefinition): ProviderDefinition => ({ ...d, policy: 'BLOCKED', adapter: undefined });
const byId = (id: string) => off(DEFINITIONS.find((d) => d.id === id)!);
const workable = byId('workable'), linkedin = byId('linkedin'), indeed = byId('indeed'), wuzzuf = byId('wuzzuf');
const reg = createRegistry(DEFINITIONS.map(off));
const SERVER_ALL_ON = { workable: 'FILL_ONLY', linkedin: 'FILL_ONLY', indeed: 'FILL_ONLY', wuzzuf: 'FILL_ONLY' } as const;

describe('provider registrations', () => {
  it('ships every registered platform enabled, with an adapter (owner: allow all for now, 2026-10-17)', () => {
    expect(DEFINITIONS.map((d) => d.id)).toEqual(['workable', 'linkedin', 'indeed', 'wuzzuf', 'greenhouse', 'lever', 'ashby', 'smartrecruiters', 'bamboohr', 'recruitee', 'teamtailor', 'personio', 'jazzhr']);
    for (const d of DEFINITIONS) expect([d.id, d.policy, typeof d.adapter]).toEqual([d.id, 'FILL_ONLY', 'function']);
    // enabled needs the server too: a silent server means blocked
    const live = createRegistry(DEFINITIONS);
    for (const d of DEFINITIONS) expect(live.policyOf(d.id, {})).toBe('BLOCKED');
    expect(live.policyOf('greenhouse', { greenhouse: 'FILL_ONLY' })).toBe('FILL_ONLY');
  });

  it('the gate: with every provider switched off nothing is enabled, even if the server says FILL_ONLY', () => {
    expect(reg.enabledMatches()).toEqual([]);
    for (const d of DEFINITIONS) expect(reg.policyOf(d.id, { ...SERVER_ALL_ON })).toBe('BLOCKED');
  });

  it('effective policy needs BOTH sides; unknown is blocked', () => {
    expect(effectivePolicy('FILL_ONLY', 'FILL_ONLY')).toBe('FILL_ONLY');
    expect(effectivePolicy('FILL_ONLY', 'BLOCKED')).toBe('BLOCKED');
    expect(effectivePolicy('FILL_ONLY', undefined)).toBe('BLOCKED');
    expect(effectivePolicy('BLOCKED', 'FILL_ONLY')).toBe('BLOCKED');
    expect(reg.policyOf('made-up', SERVER_ALL_ON)).toBe('BLOCKED');
  });

  it('Workable scope is its two job-page hosts only', () => {
    expect(workable.urlPatterns).toEqual(['https://jobs.workable.com/view/*', 'https://apply.workable.com/*']);
  });

  it('rejects broad or malformed patterns and duplicate ids', () => {
    for (const bad of ['<all_urls>', '*://*/*', 'https://*/*', 'https://*.com/*', 'file:///*', 'https://example/*', 'ftp://a.example.com/*'])
      expect(isAllowedPattern(bad)).toBe(false);
    expect(() => createRegistry([{ ...workable, urlPatterns: ['<all_urls>'] }])).toThrow('not allowed');
    expect(() => createRegistry([workable, workable])).toThrow('Duplicate');
  });
});

describe('URL routing and unsupported pages', () => {
  const r = (u: string, server: Record<string, 'FILL_ONLY' | 'BLOCKED'> = { ...SERVER_ALL_ON }) => reg.route(u, server);

  it.each([
    ['https://jobs.workable.com/view/abc123/engineer', 'blocked', 'workable', 'provider_blocked'],
    ['https://apply.workable.com/acme/j/123/', 'blocked', 'workable', 'provider_blocked'],
    ['https://apply.workable.com/acme/', 'unsupported', 'workable', 'outside_scope'],
    ['https://www.linkedin.com/jobs/view/123', 'blocked', 'linkedin', 'provider_blocked'],
    ['https://www.linkedin.com/feed/', 'unsupported', 'linkedin', 'outside_scope'],
    ['https://eg.indeed.com/viewjob?jk=1', 'blocked', 'indeed', 'provider_blocked'],
    ['https://wuzzuf.net/jobs/p/xyz-engineer', 'blocked', 'wuzzuf', 'provider_blocked'],
    ['https://wuzzuf.net/about', 'unsupported', 'wuzzuf', 'outside_scope'],
    ['https://example.com/careers/1', 'unsupported', null, 'unknown_site'],
    ['not a url', 'unsupported', null, 'invalid_url'],
    ['javascript:alert(1)', 'unsupported', null, 'invalid_url'],
    ['file:///etc/passwd', 'unsupported', null, 'invalid_url'],
    ['chrome://settings', 'unsupported', null, 'invalid_url'],
  ])('%s -> %s (%s, %s)', (url, status, provider, reason) => {
    expect(r(url)).toMatchObject({ status, provider, reason });
  });

  it('Workable /view/ is classified as an internal-form listing even while blocked', () => {
    expect(r('https://jobs.workable.com/view/abc').classification).toEqual({ provider: 'workable', page: 'apply-form', applyVia: 'internal-form' });
  });

  it('Wuzzuf: the URL alone cannot say internal form vs external ATS, so it stays unknown', () => {
    expect(wuzzuf.classify(new URL('https://wuzzuf.net/jobs/p/xyz'))).toMatchObject({ applyVia: 'unknown' });
    expect(wuzzuf.capabilities.externalRedirects).toBe(true);
    for (const d of [linkedin, indeed]) expect(d.capabilities.externalRedirects).toBe(true);
  });

  it('a Wuzzuf listing that redirects to an ATS is routed by the destination host, not by Wuzzuf', () => {
    // The external destination is its own page for its own provider (or a stranger).
    expect(r('https://jobs.workable.com/view/redirected-from-wuzzuf')).toMatchObject({ provider: 'workable', reason: 'provider_blocked' });
    expect(r('https://careers.some-company.example/apply/42')).toMatchObject({ provider: null, reason: 'unknown_site' });
  });

  it('supported only with BOTH policy FILL_ONLY and an adapter, and a known apply route', () => {
    const base = { ...workable, policy: 'FILL_ONLY' as const };
    const url = 'https://jobs.workable.com/view/abc';
    const adapter = async () => ({ prepare: async () => ({ kind: 'ready' as const }), inspectOutcome: async () => ({ kind: 'unknown' as const }) });
    expect(createRegistry([base]).route(url, { workable: 'FILL_ONLY' })).toMatchObject({ status: 'unsupported', reason: 'no_adapter' });
    expect(createRegistry([{ ...base, adapter }]).route(url, { workable: 'BLOCKED' })).toMatchObject({ status: 'blocked' });
    expect(createRegistry([{ ...base, adapter }]).route(url)).toMatchObject({ status: 'blocked' }); // server unknown
    expect(createRegistry([{ ...base, adapter }]).route(url, { workable: 'FILL_ONLY' })).toMatchObject({ status: 'supported' });
    // listing whose apply route is unknown is refused even when enabled
    const wz = { ...wuzzuf, policy: 'FILL_ONLY' as const, adapter };
    expect(createRegistry([wz]).route('https://wuzzuf.net/jobs/p/x', { wuzzuf: 'FILL_ONLY' })).toMatchObject({ reason: 'apply_route_unknown' });
  });
});

describe('match patterns', () => {
  it('matches host, scheme and path wildcards precisely', () => {
    const p = 'https://jobs.workable.com/view/*';
    expect(matchesPattern(p, new URL('https://jobs.workable.com/view/a'))).toBe(true);
    expect(matchesPattern(p, new URL('http://jobs.workable.com/view/a'))).toBe(false);
    expect(matchesPattern(p, new URL('https://jobs.workable.com/other'))).toBe(false);
    expect(matchesPattern(p, new URL('https://evil-jobs.workable.com.attacker.test/view/a'))).toBe(false);
    expect(matchesPattern('https://*.indeed.com/viewjob*', new URL('https://eg.indeed.com/viewjob?jk=1'))).toBe(true);
    expect(matchesPattern('https://*.indeed.com/viewjob*', new URL('https://notindeed.com/viewjob'))).toBe(false);
  });
});

describe('fixture provider (fixtures build only)', () => {
  it('is FILL_ONLY, local only, and not in the production definitions', () => {
    expect(fixtureProvider.urlPatterns).toEqual(['http://127.0.0.1:4012/*']);
    expect(DEFINITIONS).not.toContain(fixtureProvider);
    const withFx = createRegistry([...DEFINITIONS, fixtureProvider]);
    expect(withFx.enabledMatches()).toContain('http://127.0.0.1:4012/*'); // plus the active production providers
    expect(withFx.route('http://127.0.0.1:4012/form.html', { fixture: 'FILL_ONLY' })).toMatchObject({ status: 'supported', provider: 'fixture' });
    expect(withFx.route('http://127.0.0.1:9999/form.html', { fixture: 'FILL_ONLY' })).toMatchObject({ status: 'unsupported' });
  });
});
