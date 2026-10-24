// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildRows } from '../src/core/form-review';
import { inspectForm } from '../src/dom/inspect';
import type { Profile } from '../src/dom/types';

const profile = { firstName: 'Youssif' } as unknown as Profile;
const rows = (html: string) => {
  document.body.innerHTML = html;
  return buildRows(inspectForm(document), profile);
};

describe('rows carry what an answer needs', () => {
  it('a textarea is a fillable free-text row, a select keeps its options', () => {
    const r = rows('<form><label for="a">Why us?</label><textarea id="a" required></textarea><label for="b">Country</label><select id="b"><option value="">Choose</option><option value="eg">Egypt</option><option value="us">United States</option></select></form>');
    const why = r.find((x) => x.label.startsWith('Why us'))!;
    expect(why).toMatchObject({ kind: 'text', ftype: 'textarea', required: true, status: 'pending' });
    expect(why.proposed).toBeUndefined(); // never mapped from the profile: only a drafted/confirmed answer fills it
    const country = r.find((x) => x.label === 'Country')!;
    expect(country.options).toEqual([{ value: 'eg', label: 'Egypt' }, { value: 'us', label: 'United States' }]); // placeholder dropped
  });
});
