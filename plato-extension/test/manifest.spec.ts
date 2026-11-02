import { describe, expect, it } from 'vitest';
import key from '../extension-key.json';
import { buildManifest } from '../src/manifest';
import { DEFINITIONS } from '../src/providers/definitions';
import { fixtureProvider } from '../src/providers/fixture';
import { createRegistry } from '../src/providers/registry';

const CSP = (api: string) =>
  `default-src 'none'; script-src 'self'; connect-src ${api}; img-src 'self' data:; style-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'`;

describe('production manifest (pinned exactly)', () => {
  const m = buildManifest({ flavor: 'production', apiOrigin: 'https://api.plato.test', registry: createRegistry(DEFINITIONS) });

  it('equals the approved shape: four permissions, no hosts, one content script for the enabled platforms only', () => {
    expect(m).toEqual({
      manifest_version: 3,
      name: 'Plato Apply',
      version: '0.1.0',
      description: 'Fills job applications in your own browser from your Plato profile, and asks you only when it needs you.',
      icons: { '16': 'icon16.png', '32': 'icon32.png', '48': 'icon48.png', '128': 'icon128.png' },
      minimum_chrome_version: '116',
      key: key.key,
      permissions: ['sidePanel', 'storage', 'tabGroups', 'debugger'],
      action: { default_title: 'Plato Apply', default_icon: { '16': 'icon16.png', '32': 'icon32.png', '48': 'icon48.png', '128': 'icon128.png' } },
      side_panel: { default_path: 'panel.html' },
      background: { service_worker: 'background.js' },
      content_security_policy: { extension_pages: CSP('https://api.plato.test') },
      content_scripts: [
        {
          matches: DEFINITIONS.flatMap((d) => d.urlPatterns), // every enabled platform, nothing else
          js: ['content.js'],
          run_at: 'document_idle',
          all_frames: false,
        },
      ],
    });
  });

  it('has none of the privileges we promised not to take', () => {
    for (const k of ['host_permissions', 'optional_host_permissions', 'optional_permissions', 'externally_connectable', 'web_accessible_resources', 'declarative_net_request', 'sandbox'])
      expect(m).not.toHaveProperty(k);
    // debugger is taken on purpose (owner, 2026-10-21): trusted mouse / key events for custom dropdowns, boxes and Submit
    for (const p of ['tabs', 'scripting', 'cookies', 'webRequest', 'activeTab', 'history', 'identity', 'nativeMessaging', 'downloads'])
      expect(m.permissions).not.toContain(p);
  });

  it('the CSP allows exactly one network origin and no inline script', () => {
    const csp = m.content_security_policy.extension_pages;
    expect(csp.match(/connect-src ([^;]+)/)![1]).toBe('https://api.plato.test');
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it('the extension id is derived from the pinned key', () => {
    expect(key.id).toMatch(/^[a-p]{32}$/);
  });
});

describe('content scripts follow the registry', () => {
  it('only FILL_ONLY providers produce matches; BLOCKED ones never do', () => {
    const blocked = createRegistry(DEFINITIONS.map((d) => ({ ...d, policy: 'BLOCKED' as const })));
    expect(buildManifest({ flavor: 'production', apiOrigin: 'https://a.test', registry: blocked })).not.toHaveProperty('content_scripts');
    const one = createRegistry(DEFINITIONS.map((d) => ({ ...d, policy: d.id === 'workable' ? ('FILL_ONLY' as const) : ('BLOCKED' as const) })));
    const m = buildManifest({ flavor: 'production', apiOrigin: 'https://a.test', registry: one });
    expect(m.content_scripts).toEqual([{ matches: ['https://jobs.workable.com/view/*', 'https://apply.workable.com/*'], js: ['content.js'], run_at: 'document_idle', all_frames: false }]);
    expect(m).not.toHaveProperty('host_permissions');
  });

  it('fixtures flavor matches the local fixture origin only, with the probe first', () => {
    const m = buildManifest({ flavor: 'fixtures', apiOrigin: 'http://127.0.0.1:4011', registry: createRegistry([...DEFINITIONS, fixtureProvider]) });
    expect(m.content_scripts).toEqual([{ matches: ['http://127.0.0.1:4012/*'], js: ['probe.js', 'content.js'], run_at: 'document_start', all_frames: false }]);
    expect(m.permissions).toEqual(['sidePanel', 'storage', 'tabGroups', 'debugger']);
  });
});

describe('the store package', () => {
  it('carries no key (the Web Store refuses one and assigns its own id); the unpacked build keeps the pinned key', () => {
    const registry = createRegistry(DEFINITIONS);
    const store = buildManifest({ flavor: 'production', apiOrigin: 'https://api.plato.test', registry, store: true });
    const dev = buildManifest({ flavor: 'production', apiOrigin: 'https://api.plato.test', registry });
    expect(store).not.toHaveProperty('key');
    expect(dev).toHaveProperty('key');
    expect({ ...store, key: dev.key }).toEqual(dev); // the only difference
  });
});
