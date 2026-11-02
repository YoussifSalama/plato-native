import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Builds both flavors and inspects what would actually ship. Supplementary to
// the manifest and runtime tests, which are the real guarantees.
const root = join(__dirname, '..');
const read = (flavor: string, f: string) => readFileSync(join(root, 'dist', flavor, f), 'utf8');

beforeAll(() => {
  for (const flavor of ['production', 'fixtures']) execFileSync('node', ['scripts/build.mjs', `--flavor=${flavor}`], { cwd: root, stdio: 'pipe' });
}, 60_000);

describe('production bundle', () => {
  it('ships no fixture provider, probe, or local fixture origin', () => {
    expect(readdirSync(join(root, 'dist/production')).sort()).toEqual(['background.js', 'content.js', 'icon128.png', 'icon16.png', 'icon32.png', 'icon48.png', 'manifest.json', 'panel.css', 'panel.html', 'panel.js']);
    for (const f of ['background.js', 'panel.js', 'content.js']) {
      const src = read('production', f);
      expect(src).not.toMatch(/fixtureProvider|platoProbe|127\.0\.0\.1:4012|plato:inspect/);
    }
  });

  it('has a content script only for the enabled platforms, nothing local', () => {
    expect(existsSync(join(root, 'dist/production/content.js'))).toBe(true);
    const m = JSON.parse(read('production', 'manifest.json'));
    expect(m.content_scripts).toHaveLength(1);
    expect(m.content_scripts[0].matches.every((x: string) => /^https:\/\//.test(x))).toBe(true); // https only
    expect(read('production', 'content.js')).not.toMatch(/localhost|127\.0\.0\.1|plato:inspect/);
  });

  it('the service worker has no network, no message handler, no storage reads', () => {
    const sw = read('production', 'background.js');
    expect(sw).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|onMessage|storage\.local\.get|storage\.session|tabs\./);
    expect(sw).toMatch(/TRUSTED_CONTEXTS/);
  });

  it('the panel never uses innerHTML, eval or dynamic code, and talks to no hard-coded host', () => {
    const p = read('production', 'panel.js');
    expect(p).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|importScripts/);
    // the only URLs in the panel are the configured API origin and the Plato web app (plain links)
    const urls = new Set(p.match(/https?:\/\/[^\s"'`)]+/g) ?? []);
    expect([...urls].filter((u) => !u.includes('*') && u !== 'http://www.w3.org/2000/svg').sort()).toEqual(['http://localhost:3000', 'http://localhost:3001']); // the SVG namespace is a name, never fetched // the rest are registered match patterns, never fetched
    expect(read('production', 'panel.html')).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[^<]/); // no inline script
    expect(read('production', 'panel.html')).not.toMatch(/\son[a-z]+=/i);
  });
});

describe('fixtures bundle', () => {
  it('has the probe first and a content script that touches no storage, cookies or network', () => {
    const m = JSON.parse(read('fixtures', 'manifest.json'));
    expect(m.content_scripts[0].js).toEqual(['probe.js', 'content.js']);
    const c = read('fixtures', 'content.js');
    expect(c).not.toMatch(/chrome\.storage|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|plato\.token|createTokenStore/);
  });

  it('the DOM engine in the content script never submits, never touches buttons, and clicks only checkboxes/radios', () => {
    const c = read('fixtures', 'content.js');
    expect(c).not.toMatch(/requestSubmit|\.submit\s*\(|form\.submit/i);
    expect(c.match(/\.click\(\)/g)?.length).toBe(4); // setChecked(), setGroup() (dom/fill.ts), the guest-form Submit (dom/submit.ts) and the AI planner's ref press (dom/snapshot.ts); a type-ahead option is pressed with pointer events
    expect(c).toMatch(/plato:form:fill/);
    // it can only act on what the inspector registered, and skips sensitive fields
    expect(c).toMatch(/sensitiveExcluded/);
    expect(c).not.toMatch(/chrome\.storage|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it('every source file of the DOM engine is free of network, storage, cookie and submit APIs', () => {
    for (const f of ['inspect', 'fill', 'mapper', 'text', 'types', 'submit', 'snapshot', 'deep'] as const) {
      const src = readFileSync(join(root, 'src/dom', `${f}.ts`), 'utf8');
      expect(src, f).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|chrome\.|localStorage|sessionStorage|indexedDB|document\.cookie|requestSubmit|\.submit\(/);
    }
  });
});
