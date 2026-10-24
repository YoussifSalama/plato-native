import { APP_PATH } from './orchestrator.tools';

it('open_path allows only app pages', () => {
  const id = 'a'.repeat(24);
  for (const ok of [
    '/',
    '/jobs',
    `/jobs/${id}`,
    '/career/skills',
    '/career/interviews',
    `/career/interviews/${id}`,
    '/profile',
  ])
    expect(APP_PATH.test(ok)).toBe(true);
  for (const bad of [
    'https://evil.com',
    '//evil.com',
    '/jobs/../x',
    '/api/auth/logout',
    '/jobs/abc',
    '/login',
  ])
    expect(APP_PATH.test(bad)).toBe(false);
});
