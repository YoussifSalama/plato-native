import key from '../extension-key.json';
import type { Registry } from './providers/registry';

export type Flavor = 'production' | 'fixtures';
// Flat file names: the production package allows no directories (scripts/package-lib.mjs).
const ICONS = { '16': 'icon16.png', '32': 'icon32.png', '48': 'icon48.png', '128': 'icon128.png' };

/** The ONLY description of what the extension may do. Tests pin it exactly. */
export function buildManifest(o: { flavor: Flavor; apiOrigin: string; webOrigin?: string; registry: Registry; version?: string; store?: boolean }) {
  // The fixtures build matches only its local fixture page, never a real site.
  const matches = o.flavor === 'fixtures' ? o.registry.all.filter((d) => d.policy === 'FILL_ONLY' && d.id === 'fixture').flatMap((d) => d.urlPatterns) : o.registry.enabledMatches();
  return {
    manifest_version: 3,
    name: o.flavor === 'fixtures' ? 'Plato Apply (fixtures)' : 'Plato Apply',
    version: o.version ?? '0.1.0',
    description: 'Fills job applications in your own browser from your Plato profile, and asks you only when it needs you.',
    minimum_chrome_version: '116',
    // The pinned key is the Web Store listing's public key, so unpacked/dev builds get the store id
    // (khlefnjhigieijnbjhgfedpmenobcope) and the backend trusts one origin. The store refuses a key in an uploaded
    // package ("key field is not allowed in manifest"), so the store build leaves it out; the store assigns the same id.
    ...(o.store ? {} : { key: key.key }),
    // tabGroups only labels the tabs Plato opens ("Plato" group). No host_permissions, no tabs/cookies/webRequest.
    // debugger: real mouse / key events into the job's tab (custom dropdowns, boxes, Submit), the same way a person presses.
    // scripting + optional any-site access (owner, 2026-11-13): a job's Apply button can hand the application to the
    // company's own site. The seeker grants "any site" once (Start batch); Plato then loads its page reader only into a
    // tab its own run led to (the job's tab, or a tab that tab opened), never into anything else.
    // notifications: the seeker hears each outcome (applied, needs you, skipped, not sent, batch finished) outside the panel.
    permissions: ['sidePanel', 'storage', 'tabGroups', 'debugger', 'scripting', 'notifications', 'system.cpu', 'system.memory'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    icons: ICONS,
    action: { default_title: 'Plato Apply', default_icon: ICONS },
    side_panel: { default_path: 'panel.html' },
    // Only the Plato web app may message the extension, and only to hand over a one-time
    // pairing code when the seeker is logged in there (background.ts). Match patterns take
    // no port, so a local web origin is matched by host.
    ...(o.webOrigin && { externally_connectable: { matches: [`${new URL(o.webOrigin).protocol}//${new URL(o.webOrigin).hostname}/*`] } }),
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
