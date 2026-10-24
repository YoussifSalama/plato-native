import type { Evidence } from '../core/types';
import type { ProviderDefinition } from './types';

// FIXTURES BUILD ONLY (never in the production bundle): a stand-in provider
// for local fixture pages. prepare() does nothing (the generic form review in
// the panel does the inspecting and, once the person approves, the filling);
// inspectOutcome() only asks the fixture-flavor probe what the page shows.
// Nothing here submits.
export const FIXTURE_ORIGIN = 'http://127.0.0.1:4012';

export const fixtureProvider: ProviderDefinition = {
  id: 'fixture',
  label: 'Local fixture',
  hosts: ['127.0.0.1'],
  policy: 'FILL_ONLY',
  urlPatterns: [`${FIXTURE_ORIGIN}/*`],
  capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false },
  classify: (u) =>
    u.origin === FIXTURE_ORIGIN
      ? { provider: 'fixture', page: 'apply-form', applyVia: 'internal-form' }
      : { provider: 'fixture', page: 'other', applyVia: 'none' },
  adapter: async () => ({
    prepare: async () => ({ kind: 'ready' }),
    inspectOutcome: async (tabId: number): Promise<Evidence> => {
      try {
        const r = (await chrome.tabs.sendMessage(tabId, { type: 'plato:inspect' })) as Evidence | undefined;
        return r ?? { kind: 'unknown' };
      } catch {
        return { kind: 'unknown' };
      }
    },
  }),
};
