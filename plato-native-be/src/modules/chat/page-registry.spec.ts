import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { PAGES, pathOfControl } from './page-registry';

// Every control in the registry must really exist in the frontend code under that
// name. If someone renames a button, this fails instead of the assistant guessing.
const FE = join(__dirname, '../../../../plato-job-seeker-native-fe');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    if (f === 'node_modules' || f === '.next') return [];
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? sources(p)
      : /\.tsx$/.test(f)
        ? [readFileSync(p, 'utf8')]
        : [];
  });
}

it('every registry control exists in the frontend code', () => {
  const code = [
    ...sources(join(FE, 'app')),
    ...sources(join(FE, 'components')),
  ].join('\n');
  const missing = Object.values(PAGES)
    .flatMap((p) => p.controls)
    .filter(
      (c) =>
        !code.includes(c.tpl ? `data-ai={\`${c.tpl}` : `data-ai="${c.id}"`),
    )
    .map((c) => c.id);
  expect(missing).toEqual([]);
});

it('finds the page of a control that is not on screen', () => {
  expect(pathOfControl('notifications.mark-all-read')).toBe('/notifications');
  expect(pathOfControl('career.new-conversation')).toBe('/career');
  expect(pathOfControl('jobs.search:abc')).toBe('/jobs');
  expect(pathOfControl('results.tab.saved')).toBeNull();
});
