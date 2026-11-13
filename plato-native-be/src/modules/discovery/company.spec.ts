import { companyDomain, normalizeCompany } from './company';

it('one company, one name and key', () => {
  const variants = [
    'Microsoft',
    'Microsoft Corp.',
    'MICROSOFT CORPORATION',
    'microsoft, Inc.',
    'Microsoft (Remote)',
  ];
  for (const v of variants) expect(normalizeCompany(v).key).toBe('microsoft');
  expect(normalizeCompany('MICROSOFT CORPORATION').name).toBe('Microsoft');
  expect(normalizeCompany('Microsoft Corp.').name).toBe('Microsoft');
  // acronyms and brand words stay in the shown name, not in the key
  expect(normalizeCompany('IBM').name).toBe('IBM');
  expect(normalizeCompany('Acme Technologies LLC').name).toBe(
    'Acme Technologies',
  );
  expect(normalizeCompany('Acme Technologies LLC').key).toBe('acme');
  expect(normalizeCompany('Inc').name).toBe('Inc'); // never empties a name
  expect(normalizeCompany(null)).toEqual({ name: '', key: '' });
});

it('only an employer site gives a logo domain', () => {
  expect(companyDomain('https://www.microsoft.com/careers')).toBe(
    'microsoft.com',
  );
  expect(
    companyDomain('https://www.linkedin.com/company/microsoft'),
  ).toBeNull();
  expect(companyDomain('boards.greenhouse.io/acme')).toBeNull();
  expect(companyDomain('not a url')).toBeNull();
  expect(companyDomain(null)).toBeNull();
});

describe('companyMark: the employer logo a source gives, and its own website', () => {
  const { companyMark } =
    jest.requireActual<typeof import('./company')>('./company');
  it('LinkedIn: its CDN logo, and the website it lists when the link is LinkedIn', () => {
    expect(
      companyMark({
        company_url: 'https://www.linkedin.com/company/blackstoneeit',
        raw: {
          companyLogo:
            'https://media.licdn.com/dms/image/v2/x/company-logo_100_100/0?e=1&t=a',
          companyWebsite: 'http://www.blackstoneeit.com',
        },
      }),
    ).toEqual({
      logo: 'https://media.licdn.com/dms/image/v2/x/company-logo_100_100/0?e=1&t=a',
      domain: 'blackstoneeit.com',
    });
  });
  it('never an image from an unknown host, never http', () => {
    expect(
      companyMark({ raw: { companyLogo: 'https://evil.example/x.png' } }).logo,
    ).toBeNull();
    expect(
      companyMark({ raw: { companyLogo: 'http://media.licdn.com/x.png' } })
        .logo,
    ).toBeNull();
  });
  it('a board link is no website', () => {
    expect(
      companyMark({ company_url: 'https://jobs.lever.co/acme' }).domain,
    ).toBeNull();
  });
});
