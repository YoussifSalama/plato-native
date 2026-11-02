// node scripts/build.mjs --flavor=production|fixtures
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flavor = (process.argv.find((a) => a.startsWith('--flavor=')) ?? '--flavor=production').split('=')[1];
if (!['production', 'fixtures'].includes(flavor)) throw new Error(`Unknown flavor ${flavor}`);

// Engine: v3 (the browser use tool, default) or v2 (frozen). The fixtures build keeps v2 for its runtime suite; test/runtime/v3.mjs builds v3.
const engine = (process.argv.find((a) => a.startsWith('--engine=')) ?? `--engine=${process.env.PLATO_ENGINE ?? (flavor === 'fixtures' ? 'v2' : 'v3')}`).split('=')[1];
if (!['v2', 'v3'].includes(engine)) throw new Error(`Unknown engine ${engine}`);
// Auto-submit: on (default; Plato presses Submit once SUBMIT_READY) or off (--submit=off: the run stops armed and the person presses Submit). Live-test aid, never the shipped default.
const autoSubmit = (process.argv.find((a) => a.startsWith('--submit=')) ?? '--submit=on').split('=')[1] !== 'off';
const apiOrigin = process.env.PLATO_API_ORIGIN ?? (flavor === 'fixtures' ? 'http://127.0.0.1:4011' : 'http://localhost:3000');
const u = new URL(apiOrigin);
if (u.origin !== apiOrigin || (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)))
  throw new Error(`PLATO_API_ORIGIN must be a bare https origin (http only for localhost): ${apiOrigin}`);

// The Plato web app. Dev default: the Next dev server next to a local API; otherwise it must be set.
const isLocal = (h) => ['localhost', '127.0.0.1'].includes(h);
const webOrigin = process.env.PLATO_WEB_ORIGIN ?? (isLocal(u.hostname) ? 'http://localhost:3001' : apiOrigin);
for (const o of new Set([webOrigin])) {
  const w = new URL(o);
  if (w.origin !== o || (w.protocol !== 'https:' && !isLocal(w.hostname)))
    throw new Error(`PLATO_WEB_ORIGIN must be a bare https origin (http only for localhost): ${o}`);
}

const outArg = process.argv.find((a) => a.startsWith('--out='));
const out = outArg ? join(root, outArg.slice(6)) : join(root, 'dist', flavor);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Fixtures build only: swap the (empty) extra-provider module for the fixture provider.
const swapExtra = {
  name: 'swap-fixture-modules',
  setup(b) {
    if (flavor !== 'fixtures') return;
    b.onResolve({ filter: /\/extra$/ }, () => ({ path: join(root, 'src/providers/extra.fixtures.ts') }));
  },
};
const common = { plugins: [swapExtra], bundle: true, format: 'iife', target: 'chrome116', minify: false, legalComments: 'none', define: { __FLAVOR__: JSON.stringify(flavor), __ENGINE__: JSON.stringify(engine), __AUTO_SUBMIT__: JSON.stringify(autoSubmit), __API_ORIGIN__: JSON.stringify(apiOrigin), __WEB_ORIGIN__: JSON.stringify(webOrigin), __BUILD__: JSON.stringify(new Date().toTimeString().slice(0, 5) + ' ' + new Date().toISOString().slice(5, 10)) }, logLevel: 'warning' };
// The manifest comes from the same registry the panel uses.
const m = await build({ entryPoints: [join(root, 'src/manifest.entry.ts')], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [swapExtra], define: common.define, logLevel: 'warning' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(m.outputFiles[0].text).toString('base64'));
const manifest = mod.buildManifest({ flavor, apiOrigin, registry: mod.registry });

// No enabled provider = no content script file at all.
const entries = { 'background.js': 'src/background.ts', 'panel.js': 'src/panel/main.ts' };
if (manifest.content_scripts) entries['content.js'] = 'src/content/content.ts';
if (flavor === 'fixtures') entries['probe.js'] = 'src/content/probe.ts';
for (const [file, entry] of Object.entries(entries)) await build({ ...common, entryPoints: [join(root, entry)], outfile: join(out, file) });
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const f of ['panel.html', 'panel.css']) copyFileSync(join(root, f), join(out, f));
for (const f of ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png']) copyFileSync(join(root, 'icons', f), join(out, f));
console.log(`built ${flavor} (engine ${engine}, auto-submit ${autoSubmit ? 'on' : 'OFF'}) -> ${out.replace(root + '/', '')} (api ${apiOrigin}, content scripts: ${manifest.content_scripts ? manifest.content_scripts[0].matches.join(', ') : 'none'})`);
