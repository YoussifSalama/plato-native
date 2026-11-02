// npm run package -> dist/plato-apply-<version>.zip, built into dist/store WITHOUT the manifest key (the Web Store
// refuses it); dist/production (unpacked, keyed, fixed id) is untouched.
// Takes NO arguments: it always builds the production flavor itself and cannot
// be pointed at a fixtures build. PLATO_API_ORIGIN must be an https origin.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageProduction, PackagingError } from './package-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (process.argv.length > 2) throw new PackagingError(`package takes no arguments (got ${process.argv.slice(2).join(' ')})`);
  const origin = process.env.PLATO_API_ORIGIN;
  if (!origin || !origin.startsWith('https://')) throw new PackagingError('set PLATO_API_ORIGIN to the https API origin to package');
  const b = spawnSync('node', ['scripts/build.mjs', '--flavor=production', '--store', '--out=dist/store'], { cwd: root, stdio: 'inherit', env: process.env });
  if (b.status !== 0) throw new PackagingError('production build failed');
  const dir = join(root, 'dist/store');
  const { version } = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const r = packageProduction(dir, join(root, `dist/plato-apply-${version}.zip`));
  console.log(`packaged ${r.file}\n  files: ${r.files.join(', ')}\n  sha256: ${r.sha256}`);
} catch (e) {
  if (!(e instanceof PackagingError)) throw e;
  console.error(`PACKAGING REFUSED: ${e.message}`);
  process.exit(1);
}
