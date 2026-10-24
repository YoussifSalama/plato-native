import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Loads a synthetic fixture into the jsdom document of the current test. */
export function load(name: string): Document {
  const html = readFileSync(join(__dirname, 'fixtures/dom', `${name}.html`), 'utf8');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)![1]!;
  return document;
}
export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
