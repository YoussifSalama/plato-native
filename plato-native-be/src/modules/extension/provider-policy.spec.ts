import { autoSubmitProviders, enabledMatches, policyFor, PROVIDER_POLICY } from './provider-policy';
import { isExtensionOwned } from '../apply/engine-guard';

describe('provider policy gate', () => {
  it('the registered platforms are enabled (owner approval 2026-10-17); anything unknown is blocked', () => {
    for (const p of ['greenhouse', 'lever', 'ashby', 'workable', 'linkedin', 'indeed', 'wuzzuf']) expect(policyFor(p)).toBe('FILL_ONLY');
    expect(PROVIDER_POLICY.workable).toBe('FILL_ONLY');
    expect(policyFor('some-new-board')).toBe('BLOCKED'); // unknown = blocked
    expect(enabledMatches().length).toBeGreaterThan(7);
    // auto-submit: the guest-form ATSs and LinkedIn Easy Apply, never Indeed / Wuzzuf
    expect(autoSubmitProviders().sort()).toEqual(['ashby', 'bamboohr', 'greenhouse', 'jazzhr', 'lever', 'linkedin', 'personio', 'recruitee', 'smartrecruiters', 'teamtailor', 'workable']);
  });
});

describe('legacy engine guard', () => {
  it('flags extension-owned rows', () => {
    expect(isExtensionOwned({ engine: 'EXTENSION', status: 'FAILED' })).toBe(
      true,
    );
    expect(isExtensionOwned({ engine: null, status: 'EXTENSION_ACTIVE' })).toBe(
      true,
    );
    expect(isExtensionOwned({ engine: null, status: 'FAILED' })).toBe(false);
  });
});
