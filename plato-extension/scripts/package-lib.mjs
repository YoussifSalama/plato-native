// Production packaging guard + a dependency-free ZIP writer/reader.
// Nothing here can package a fixtures build: the guard checks CONTENT (not a
// flag a build could forget to set), and runs on the directory and again on the
// finished ZIP.
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Exactly what a production build may contain. Anything else (probe.js,
// source maps, fixtures, stray files) fails the guard.
export const ALLOWED_FILES = ['background.js', 'manifest.json', 'panel.css', 'panel.html', 'panel.js'];
const OPTIONAL_FILES = ['content.js']; // only when the manifest declares a content script
const FORBIDDEN_IN_JS = [/fixtureProvider/, /platoProbe/, /plato:inspect/, /127\.0\.0\.1/, /localhost/, /\(fixtures\)/, /FIXTURE_ORIGIN/];
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export class PackagingError extends Error {}
const fail = (msg) => { throw new PackagingError(msg); };

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) fail(`unexpected directory in package: ${name}/`);
    out.push(name);
  }
  return out.sort();
}

export function assertAllowedNames(names, hasContentScript) {
  const allowed = new Set([...ALLOWED_FILES, ...(hasContentScript ? OPTIONAL_FILES : [])]);
  for (const n of names) {
    if (n.includes('..') || n.startsWith('/') || n.includes('\\') || n.includes('/')) fail(`unsafe path in package: ${n}`);
    if (!allowed.has(n)) fail(`file not allowed in a production package: ${n}`);
  }
  for (const n of allowed) if (!n.endsWith('content.js') && !names.includes(n)) fail(`missing required file: ${n}`);
  if (hasContentScript && !names.includes('content.js')) fail('manifest declares a content script but content.js is missing');
}

/** Throws PackagingError unless `dir` is a clean, https-only production build. */
export function assertProductionDir(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const hasContent = Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0;
  assertAllowedNames(listFiles(dir), hasContent);

  if (/fixture/i.test(manifest.name)) fail(`manifest name marks a fixtures build: ${manifest.name}`);
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(['sidePanel', 'storage', 'tabGroups', 'debugger'])) fail(`unexpected permissions: ${JSON.stringify(manifest.permissions)}`);
  // host_permissions only for the Plato web app's own origins: https, exact host, no wildcard, not local.
  for (const h of manifest.host_permissions ?? []) if (!/^https:\/\/[^*/]+\/\*$/.test(h) || LOCAL.test(new URL(h.replace('/*', '')).hostname)) fail(`host_permissions must be exact https origins of the Plato web app: ${h}`);
  for (const k of ['optional_host_permissions', 'optional_permissions', 'externally_connectable', 'web_accessible_resources'])
    if (k in manifest) fail(`manifest must not declare ${k}`);
  for (const cs of manifest.content_scripts ?? []) {
    if ((cs.js ?? []).some((f) => f !== 'content.js')) fail(`content script files not allowed: ${cs.js}`);
    for (const m of cs.matches ?? []) {
      let host;
      try { host = new URL(m.replace('*.', 'x.').replace(/\*.*$/, '')).hostname; } catch { fail(`bad match pattern: ${m}`); }
      if (LOCAL.test(host)) fail(`content script matches a local origin: ${m}`);
    }
  }
  const csp = manifest.content_security_policy?.extension_pages ?? '';
  const connect = /connect-src ([^;]+)/.exec(csp)?.[1]?.trim() ?? '';
  let origin;
  try { origin = new URL(connect); } catch { fail(`CSP connect-src is not a single origin: "${connect}"`); }
  if (origin.protocol !== 'https:' || LOCAL.test(origin.hostname) || origin.origin !== connect) fail(`CSP connect-src must be an https, non-local origin: ${connect}`);
  if (/unsafe-|\*/.test(csp)) fail('CSP must not contain unsafe-* or wildcards');

  for (const f of listFiles(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const re of FORBIDDEN_IN_JS) if (re.test(src)) fail(`${f} contains fixture/dev code (${re})`);
  }
}

// ---- ZIP (store only the guarded files; fixed timestamp = reproducible) ----
const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;

export function writeZip(dir, outFile) {
  const files = listFiles(dir);
  const chunks = [], central = [];
  let offset = 0;
  for (const name of files) {
    const data = readFileSync(join(dir, name));
    const comp = deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, Buffer.concat([...chunks, cd, end]));
}

/** Entries of a ZIP as { name -> Buffer }, read back from the bytes themselves. */
export function readZip(file) {
  const buf = readFileSync(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) fail('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString();
    const lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
    out[name] = method === 8 ? inflateRawSync(raw) : raw;
    p += 46 + nlen + elen + clen;
  }
  return out;
}

/** Guard the directory, write the ZIP, then guard what is actually IN the ZIP. */
export function packageProduction(dir, outFile) {
  assertProductionDir(dir);
  writeZip(dir, outFile);
  const entries = readZip(outFile);
  const manifest = JSON.parse(entries['manifest.json'].toString());
  assertAllowedNames(Object.keys(entries).sort(), Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0);
  for (const [name, data] of Object.entries(entries)) {
    if (!data.equals(readFileSync(join(dir, name)))) fail(`zip entry differs from the guarded file: ${name}`);
    if (name.endsWith('.js'))
      for (const re of FORBIDDEN_IN_JS) if (re.test(data.toString())) fail(`${name} in the zip contains fixture/dev code`);
  }
  return { file: outFile, files: Object.keys(entries).sort(), sha256: createHash('sha256').update(readFileSync(outFile)).digest('hex') };
}
