import { compactCv, CV_SCHEMA, grounded, type CvJson } from './cv-facts';

// The top of a two-column CV, as the PDF text extraction gives it (made-up person).
const TEXT = `OMAR HADDAD
Address: Jumeirah Village Circle, Dubai, UAE
Phone +201000000101/+971500000202 | Email omar.haddad@example.com
PROFESSIONAL SUMMARY Senior Solutions Architect with 9+ years of experience`;

describe('CV JSON for the apply brain', () => {
  it('keeps contact values the CV states, drops any the model made up', () => {
    const cv: CvJson = {
      contact: {
        full_name: 'OMAR HADDAD',
        emails: ['omar.haddad@example.com', 'omar@company.example'], // the second is not in the CV
        phones: ['+201000000101', '+971 50 000 0202', '+971 4 000 0000'], // formatting may differ; the last is invented
        address_line: 'Jumeirah Village Circle',
        city: 'Dubai',
        state: null,
        postal_code: '00000', // the UAE has none and the CV states none
        country: 'UAE',
        links: [],
      },
    };
    expect(grounded(cv, TEXT).contact).toEqual({
      full_name: 'OMAR HADDAD',
      emails: ['omar.haddad@example.com'],
      phones: ['+201000000101', '+971 50 000 0202'],
      address_line: 'Jumeirah Village Circle',
      city: 'Dubai',
      state: null,
      postal_code: null,
      country: 'UAE',
      links: [],
    });
    expect(grounded({ contact: { address_line: '12 Sheikh Zayed Road' } }, TEXT).contact?.address_line).toBeNull();
    expect(grounded({ contact: { postal_code: '11511' } }, `${TEXT}\nCairo 11511, Egypt`).contact?.postal_code).toBe('11511'); // a real one stays
  });

  it('the prompt copy carries no nulls or empty lists and stays under the cap', () => {
    const cv: CvJson = { contact: { city: 'Dubai', state: null, emails: [] }, skills: [], experience: [{ details: Array.from({ length: 30 }, (_, i) => `bullet ${i} ${'x'.repeat(500)}`) }] };
    expect(compactCv({ contact: { city: 'Dubai', state: null, emails: [] }, skills: [] })).toBe('{"contact":{"city":"Dubai"}}');
    const big = compactCv(cv, 3000);
    expect(big.length).toBeLessThanOrEqual(3000);
    expect(JSON.parse(big).experience[0].details).toHaveLength(4); // trimmed to the first bullets, still valid JSON
  });

  it('the schema is strict: every object closed and every field required (structured outputs)', () => {
    const walk = (s: Record<string, any>): void => {
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect(s.required).toEqual(Object.keys(s.properties));
        Object.values(s.properties).forEach((v) => walk(v as Record<string, any>));
      }
      if (s.type === 'array') walk(s.items);
    };
    walk(CV_SCHEMA);
    // the API refuses more than 16 union-typed parameters (type arrays or anyOf): this schema has none
    expect(JSON.stringify(CV_SCHEMA)).not.toMatch(/"type":\[|"anyOf"/);
  });
});
