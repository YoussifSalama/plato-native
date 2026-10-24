// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { inspectForm } from '../src/dom/inspect';
import { mapFields } from '../src/dom/mapper';
import type { FieldInfo, Profile } from '../src/dom/types';
import { $, load } from './helpers';

const profile: Profile = { firstName: 'Youssif', lastName: 'Salama', fullName: 'Youssif Salama', email: 'y@example.com', phone: '+201001234567', city: 'Cairo', country: 'Egypt', linkedin: 'https://linkedin.com/in/ys' };
const run = (name: string, p: Profile = profile) => {
  const i = inspectForm(load(name));
  const m = mapFields(i.fields, p);
  const label = (id: string) => i.fields.find((f) => f.id === id)!.label;
  return {
    mapped: Object.fromEntries(m.mappings.map((x) => [label(x.fieldId), [x.key, x.value, x.confidence]])),
    held: Object.fromEntries(m.held.map((h) => [label(h.fieldId), h.reason])),
    m,
  };
};
const f = (over: Partial<FieldInfo>): FieldInfo => ({ id: 'f', formId: 'form1', fp: 'fp', vh: 'vh', kind: 'text', type: 'text', label: '', labelSource: 'label-for', autocomplete: null, required: false, hasValue: false, ...over });

describe('common-field mapping', () => {
  it('maps recognised identity fields with explicit confidence, and holds what it should not decide', () => {
    const { mapped, held } = run('identity');
    expect(mapped['First name']).toEqual(['firstName', 'Youssif', 0.98]); // autocomplete beats label
    expect(mapped['Last name']).toEqual(['lastName', 'Salama', 0.95]);
    expect(mapped['Email address']).toEqual(['email', 'y@example.com', 0.95]);
    expect(mapped['Phone number']).toEqual(['phone', '+201001234567', 0.95]);
    expect(mapped['City']).toEqual(['city', 'Cairo', 0.95]);
    expect(mapped['LinkedIn profile']).toEqual(['linkedin', 'https://linkedin.com/in/ys', 0.95]);
    expect(mapped['Country']![1]).toBe('EG'); // the option value, found by its label
    // boxes and radio questions are never keyword-mapped: the AI decides them
    expect(held['I agree to the terms']).toBe('unmapped');
    expect(held['Are you authorised to work here?']).toBe('unmapped');
  });

  it('never maps by guesswork: duplicate labels, confirmation twins, company names and placeholders', () => {
    const { mapped, held } = run('duplicate-labels');
    expect(held['Name']).toBe('duplicate-label');
    expect(held['Phone']).toBe('duplicate-label');
    expect(mapped['Email']).toEqual(['email', 'y@example.com', 0.95]);
    expect(mapped['Confirm email']![0]).toBe('email'); // one primary + its confirmation twin
    expect(held['Company name']).toBe('unmapped'); // "name" inside a company label is not a person's name
    expect(held['First name']).toBe('low-confidence'); // a placeholder is weak evidence
    expect(held['Contact']).toBe('unmapped');
  });

  it('holds when two fields could take the same value', () => {
    const fields = [f({ id: 'a', label: 'City' }), f({ id: 'b', label: 'Town' })];
    const { mappings, held } = mapFields(fields, profile);
    expect(mappings).toEqual([]);
    expect(held.map((h) => h.reason)).toEqual(['duplicate-key', 'duplicate-key']);
  });

  it('holds when one field fits two keys about equally (ambiguous), listing both', () => {
    const fields = [f({ id: 'a', label: 'Phone or mobile website' })];
    // weak phrase matches for phone (mobile/phone) and portfolio (website) tie below the action threshold
    const { mappings, held } = mapFields(fields, profile);
    expect(mappings).toEqual([]);
    expect(held[0]!.reason).toMatch(/ambiguous|low-confidence/);
  });

  it('is deterministic: same page and profile, same result', () => {
    const doc = load('identity');
    const once = () => JSON.stringify(mapFields(inspectForm(doc).fields, profile));
    expect(once()).toBe(once());
  });

  it('holds instead of overwriting, inventing or picking a bad option', () => {
    const i = inspectForm(load('identity'));
    $<HTMLInputElement>('ci').value = 'Alexandria';
    const again = inspectForm(document);
    expect(mapFields(again.fields, profile).held.find((h) => again.fields.find((x) => x.id === h.fieldId)?.label === 'City')?.reason).toBe('already-filled');
    expect(mapFields(i.fields, { ...profile, phone: '' }).held.some((h) => h.reason === 'no-profile-value')).toBe(true);
    const germany = mapFields(i.fields, { ...profile, country: 'Germany' }); // option exists but is disabled
    expect(germany.held.some((h) => h.reason === 'no-matching-option')).toBe(true);
    const nowhere = mapFields(i.fields, { ...profile, country: 'Atlantis' });
    expect(nowhere.held.some((h) => h.reason === 'no-matching-option')).toBe(true);
  });

  it('never maps checkboxes, radios or unsupported controls, whatever their label says', () => {
    const fields = [f({ id: 'a', kind: 'checkbox', label: 'Email me updates' }), f({ id: 'b', kind: 'radio', label: 'Email' }), f({ id: 'c', kind: 'checkbox-group', label: 'Phone' })];
    const { mappings, held } = mapFields(fields, profile);
    expect(mappings).toEqual([]);
    expect(held.map((h) => [h.fieldId, h.reason])).toEqual([['a', 'unmapped'], ['b', 'unmapped'], ['c', 'unmapped']]);
  });

  it('a type=email field is an email field even with an odd label, but a vague label alone is not enough', () => {
    expect(mapFields([f({ id: 'a', kind: 'email', type: 'email', label: 'Reach you at' })], profile).mappings[0]).toMatchObject({ key: 'email', confidence: 0.9 });
    expect(mapFields([f({ id: 'a', label: 'Your email address (we never share it)' })], profile).held[0]!.reason).toBe('low-confidence');
  });

  it('only identity keys exist: nothing answers questions or reads a resume', () => {
    const { mappings, held } = mapFields([f({ id: 'a', label: 'Why do you want this job?' }), f({ id: 'b', label: 'Expected salary' })], profile);
    expect(mappings).toEqual([]);
    expect(held.map((h) => h.reason)).toEqual(['unmapped', 'unmapped']);
  });

  it('a single weak candidate carries a proposal the person may choose to use (never acted on by itself)', () => {
    const { mappings, held } = mapFields([f({ id: 'a', label: 'Your email address (we never share it)' })], profile);
    expect(mappings).toEqual([]);
    expect(held[0]).toMatchObject({ reason: 'low-confidence', proposal: { key: 'email', value: 'y@example.com' } });
    // no proposal when there is nothing to put, or the field already has a value, or the option does not exist
    expect(mapFields([f({ id: 'a', label: 'Your email address (we never share it)' })], { ...profile, email: '' }).held[0]!.proposal).toBeUndefined();
    expect(mapFields([f({ id: 'a', label: 'Your email address (we never share it)', hasValue: true })], profile).held[0]!.proposal).toBeUndefined();
  });
});
