import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AshbyApplicationForm,
  ashbyApplyUrl,
  ashbyIds,
  normalizeAshbyForm,
} from './forms/ashby.form';

// Real public posting: jobs.ashbyhq.com/notion/1fc309c8-da20-4ff2-84c7-8b863ece2b0a
// (the GraphQL response the page itself loads, captured live — see the
// ashby-notion.json fixture and ashby.adapter.ts's loadForm).
const form = JSON.parse(
  readFileSync(join(__dirname, 'forms/__fixtures__/ashby-notion.json'), 'utf8'),
) as AshbyApplicationForm;
const schema = normalizeAshbyForm(
  form,
  ashbyApplyUrl('notion', '1fc309c8-da20-4ff2-84c7-8b863ece2b0a'),
);
const field = (id: string) => schema.fields.find((f) => f.id === id);

describe('Ashby form (real Notion posting)', () => {
  it('keeps the field path as the id, typed', () => {
    expect(field('_systemfield_name')).toMatchObject({
      type: 'text',
      required: true,
    });
    expect(field('_systemfield_email')?.type).toBe('email');
    expect(field('8039f8aa-c269-467e-bdea-dec068474224')?.type).toBe('phone');
  });

  it('drops the resume field (attached as a file by the submitter)', () => {
    expect(field('_systemfield_resume')).toBeUndefined();
  });

  it('turns ValueSelect/MultiValueSelect into typed choices with labels', () => {
    const pronouns = field('b0a5aba8-dbb7-41a9-b548-f72cc3e48956');
    expect(pronouns).toMatchObject({ type: 'choice', required: false });
    expect(pronouns?.options).toContain('He/Him');

    const howHeard = field('0b3b7773-f6d9-4032-9ab1-368c4164e95a');
    expect(howHeard?.type).toBe('multi');
    expect(howHeard?.options).toContain('LinkedIn');
  });

  it('reads Boolean fields as required booleans', () => {
    expect(field('e01a85db-feaa-42b3-a9ad-69b1dcbbab3f')).toMatchObject({
      type: 'boolean',
      required: true,
    });
  });

  it('marks the LinkedIn link field as a url, not free text', () => {
    expect(field('dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb')?.type).toBe('url');
  });
});

describe('Ashby unmapped types', () => {
  it('warns and drops a required field of an unrecognised type', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const weird = normalizeAshbyForm(
      {
        sections: [
          {
            fieldEntries: [
              {
                isRequired: true,
                field: { path: 'x', title: 'Mystery field', type: 'Wat' },
              },
            ],
          },
        ],
      },
      'https://jobs.ashbyhq.com/acme/1/application',
    );
    expect(weird.fields).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Mystery field'));
    warn.mockRestore();
  });

  it('drops an optional unrecognised field silently', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const optional = normalizeAshbyForm(
      {
        sections: [
          {
            fieldEntries: [
              {
                isRequired: false,
                field: { path: 'x', title: 'Optional mystery', type: 'Wat' },
              },
            ],
          },
        ],
      },
      'https://jobs.ashbyhq.com/acme/1/application',
    );
    expect(optional.fields).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('Ashby URLs', () => {
  it('reads board + id from a posting or apply URL', () => {
    expect(
      ashbyIds(
        'https://jobs.ashbyhq.com/notion/1fc309c8-da20-4ff2-84c7-8b863ece2b0a',
      ),
    ).toEqual({ board: 'notion', id: '1fc309c8-da20-4ff2-84c7-8b863ece2b0a' });
    expect(
      ashbyIds(ashbyApplyUrl('notion', '1fc309c8-da20-4ff2-84c7-8b863ece2b0a')),
    ).toEqual({ board: 'notion', id: '1fc309c8-da20-4ff2-84c7-8b863ece2b0a' });
  });

  it('refuses a non-Ashby URL', () => {
    expect(ashbyIds('https://careers.notion.so/positions/1')).toBeNull();
  });
});
