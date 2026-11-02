import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs, no types
import { assertProductionDir, packageProduction, PackagingError, readZip } from '../scripts/package-lib.mjs';

const root = join(__dirname, '..');
const API = 'https://api.plato.test';
const tmp = mkdtempSync(join(tmpdir(), 'plato-pkg-'));
const prod = join(tmp, 'production');
const fixtures = join(tmp, 'fixtures');
beforeAll(() => {
  // --out is relative to the project root; reach the temp dir with ../
  for (const [flavor, out] of [['production', prod], ['fixtures', fixtures]] as const)
    execFileSync('node', ['scripts/build.mjs', `--flavor=${flavor}`, `--out=${relative(root, out)}`], { cwd: root, env: { ...process.env, PLATO_API_ORIGIN: API }, stdio: 'pipe' });
}, 60_000);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const copyProd = () => {
  const d = mkdtempSync(join(tmp, 'case-'));
  cpSync(prod, d, { recursive: true });
  return d;
};
const refuses = (dir: string, why: RegExp) => {
  expect(() => assertProductionDir(dir)).toThrow(PackagingError);
  expect(() => assertProductionDir(dir)).toThrow(why);
};

describe('packaging guard', () => {
  it('accepts a clean production build and produces a zip with exactly the guarded files', () => {
    assertProductionDir(prod);
    const out = join(tmp, 'ok.zip');
    const r = packageProduction(prod, out);
    expect(r.files).toEqual(['background.js', 'content.js', 'icon128.png', 'icon16.png', 'icon32.png', 'icon48.png', 'manifest.json', 'panel.css', 'panel.html', 'panel.js']);
    const entries = readZip(out);
    for (const [name, data] of Object.entries(entries)) expect((data as Buffer).equals(readFileSync(join(prod, name)))).toBe(true);
  });

  it('REFUSES a fixtures build outright and writes no zip', () => {
    const out = join(tmp, 'fx.zip');
    expect(() => packageProduction(fixtures, out)).toThrow(PackagingError);
    expect(existsSync(out)).toBe(false);
    refuses(fixtures, /not allowed|fixture|local origin/);
  });

  it('refuses each way fixture material could sneak into a production dir', () => {
    let d = copyProd(); writeFileSync(join(d, 'probe.js'), '//'); refuses(d, /probe\.js/);
    d = copyProd(); writeFileSync(join(d, 'panel.js.map'), '{}'); refuses(d, /panel\.js\.map/);
    d = copyProd(); writeFileSync(join(d, 'panel.js'), readFileSync(join(d, 'panel.js'), 'utf8') + '\nvar x = fixtureProvider;'); refuses(d, /fixture\/dev code/);
    d = copyProd(); writeFileSync(join(d, 'background.js'), readFileSync(join(d, 'background.js'), 'utf8') + '\nvar o = "http://127.0.0.1:4012";'); refuses(d, /fixture\/dev code/);
    d = copyProd(); cpSync(join(fixtures, 'probe.js'), join(d, 'probe.js')); refuses(d, /probe\.js/);
    d = copyProd(); writeFileSync(join(d, 'content.js'), readFileSync(join(d, 'content.js'), 'utf8') + '\nvar x = platoProbe;'); refuses(d, /fixture\/dev code/); // fixture material in the content script
    d = copyProd(); cpSync(join(fixtures, 'manifest.json'), join(d, 'manifest.json')); refuses(d, /content script|fixtures build|local|http/);
  });

  it('refuses a manifest that gained privileges, hosts, or a non-https API', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edit = (f: (m: Record<string, any>) => void) => {
      const d = copyProd();
      const m = JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8'));
      f(m);
      writeFileSync(join(d, 'manifest.json'), JSON.stringify(m));
      return d;
    };
    refuses(edit((m) => m.permissions.push('tabs')), /permissions/);
    refuses(edit((m) => (m.host_permissions = ['https://*/*'])), /host_permissions/);
    refuses(edit((m) => (m.externally_connectable = { matches: ['https://*/*'] })), /externally_connectable/);
    refuses(edit((m) => (m.content_security_policy.extension_pages += " 'unsafe-eval'")), /unsafe|connect-src/);
    refuses(edit((m) => (m.content_security_policy.extension_pages = m.content_security_policy.extension_pages.replace(API, 'http://localhost:3000'))), /https, non-local/);
    refuses(edit((m) => (m.content_security_policy.extension_pages = m.content_security_policy.extension_pages.replace(API, 'http://api.plato.test'))), /https, non-local/);
    refuses(edit((m) => (m.content_scripts = [{ matches: ['http://127.0.0.1:4012/*'], js: ['content.js'] }])), /local origin|content\.js/);
    refuses(edit((m) => (m.name = 'Plato Apply (fixtures)')), /fixtures build/);
  });

  it('`npm run package` refuses arguments and non-https origins, and never builds fixtures', () => {
    const run = (args: string[], env: Record<string, string>) =>
      spawnSync('node', ['scripts/package.mjs', ...args], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
    const a = run(['--flavor=fixtures'], { PLATO_API_ORIGIN: API });
    expect(a.status).toBe(1);
    expect(a.stderr).toContain('PACKAGING REFUSED');
    const b = run([], { PLATO_API_ORIGIN: 'http://localhost:3000' });
    expect(b.status).toBe(1);
    expect(b.stderr).toContain('https');
    const c = run([], { PLATO_API_ORIGIN: '' });
    expect(c.status).toBe(1);
  });
});
