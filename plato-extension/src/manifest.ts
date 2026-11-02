import key from '../extension-key.json';
import type { Registry } from './providers/registry';

export type Flavor = 'production' | 'fixtures';
// Flat file names: the production package allows no directories (scripts/package-lib.mjs).
const ICONS = { '16': 'icon16.png', '32': 'icon32.png', '48': 'icon48.png', '128': 'icon128.png' };

/** The ONLY description of what the extension may do. Tests pin it exactly. */
export function buildManifest(o: { flavor: Flavor; apiOrigin: string; registry: Registry; version?: string }) {
  // The fixtures build matches only its local fixture page, never a real site.
  const matches = o.flavor === 'fixtures' ? o.registry.all.filter((d) => d.policy === 'FILL_ONLY' && d.id === 'fixture').flatMap((d) => d.urlPatterns) : o.registry.enabledMatches();
  return {
    manifest_version: 3,
    name: o.flavor === 'fixtures' ? 'Plato Apply (fixtures)' : 'Plato Apply',
    version: o.version ?? '0.1.0',
    description: 'Fills job applications in your own browser from your Plato profile, and asks you only when it needs you.',
    minimum_chrome_version: '116',
    key: key.key,
    // tabGroups only labels the tabs Plato opens ("Plato" group). No host_permissions, no externally_connectable, no tabs/scripting/cookies/webRequest.
    // debugger: real mouse / key events into the job's tab (custom dropdowns, boxes, Submit), the same way a person presses.
    permissions: ['sidePanel', 'storage', 'tabGroups', 'debugger'],
    icons: ICONS,
    action: { default_title: 'Plato Apply', default_icon: ICONS },
    side_panel: { default_path: 'panel.html' },
    background: { service_worker: 'background.js' },
    content_security_policy: {
      extension_pages: [
        "default-src 'none'",
        "script-src 'self'",
        `connect-src ${o.apiOrigin}`,
        "img-src 'self' data:",
        "style-src 'self'",
        "frame-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ].join('; '),
    },
    // Static content scripts ONLY for providers whose policy is FILL_ONLY.
    // In production that is none, so the key is absent entirely.
    ...(matches.length && {
      content_scripts: [
        {
          matches,
          js: o.flavor === 'fixtures' ? ['probe.js', 'content.js'] : ['content.js'],
          run_at: o.flavor === 'fixtures' ? 'document_start' : 'document_idle',
          all_frames: false,
        },
      ],
    }),
  };
}
export const EXTENSION_ID: string = key.id;
