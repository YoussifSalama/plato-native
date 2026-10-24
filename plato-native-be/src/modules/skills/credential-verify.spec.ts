import { issuerOf, pageMatches, verifyCredential } from './credential-verify';

const html = (
  body: string,
  status = 200,
  headers: Record<string, string> = {},
) => Promise.resolve(new Response(body, { status, headers }));

it('only known issuers over plain https are fetched (no internal addresses)', () => {
  expect(
    issuerOf('https://www.coursera.org/account/accomplishments/verify/ABC')
      ?.issuer,
  ).toBe('Coursera');
  expect(issuerOf('https://www.credly.com/badges/1234')?.issuer).toBe('Credly');
  for (const bad of [
    'http://www.coursera.org/x',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/x',
    'https://evil.example.com/coursera.org',
    'https://coursera.org.evil.com/x',
    'https://user:pw@www.coursera.org/x',
    'https://www.coursera.org:8443/x',
    'not a url',
  ])
    expect(issuerOf(bad)).toBeNull();
});

it('needs all of the name and enough of the course on the page', () => {
  const page =
    'Youssif Salama has successfully completed Google Data Analytics Professional Certificate';
  expect(
    pageMatches(
      page,
      'Youssif Salama',
      'Google Data Analytics Professional Certificate',
    ),
  ).toEqual({ nameOk: true, titleOk: true });
  expect(
    pageMatches(
      page,
      'Someone Else',
      'Google Data Analytics Professional Certificate',
    ).nameOk,
  ).toBe(false);
  expect(
    pageMatches(page, 'Youssif Salama', 'AWS Certified Cloud Practitioner')
      .titleOk,
  ).toBe(false);
});

it('verifies, or leaves it self-reported, and never follows a redirect off the issuer', async () => {
  const ok = await verifyCredential(
    'https://www.coursera.org/account/accomplishments/verify/ABC',
    'Youssif Salama',
    'Google Data Analytics Professional Certificate',
    () =>
      html(
        '<meta property="og:title" content="Youssif Salama completed Google Data Analytics Professional Certificate"><body>x</body>',
      ),
  );
  expect(ok).toMatchObject({ status: 'VERIFIED', issuer: 'Coursera' });

  const spa = await verifyCredential(
    'https://www.credly.com/badges/1',
    'Youssif Salama',
    'AWS Cloud Practitioner',
    () => html('<div id="root"></div>'),
  );
  expect(spa.status).toBe('UNCONFIRMED');

  const missing = await verifyCredential(
    'https://www.coursera.org/x',
    'Youssif Salama',
    'Anything',
    () => html('', 404),
  );
  expect(missing.status).toBe('INVALID');

  const away = await verifyCredential(
    'https://www.coursera.org/x',
    'Youssif Salama',
    'Anything',
    () => html('', 302, { location: 'https://evil.example.com/steal' }),
  );
  expect(away.status).toBe('UNCONFIRMED');
  expect(away.note).toContain('redirects somewhere');

  const notIssuer = await verifyCredential(
    'https://example.com/cert',
    'Youssif Salama',
    'Anything',
    () => html('Youssif Salama Anything'),
  );
  expect(notIssuer).toMatchObject({ status: 'UNCONFIRMED', issuer: null });
});
