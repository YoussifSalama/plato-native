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
    '/following',
    '/extension',
    '/tokens',
    '/profile?tab=answers',
    '/applications?tab=needs',
    '/jobs?company=PwC',
    `/jobs/review?ids=${id},${id}`,
    '/career?prompt=Score%20my%20resume',
  ])
    expect(APP_PATH.test(ok)).toBe(true);
  for (const bad of [
    'https://evil.com',
    '//evil.com',
    '/jobs/../x',
    '/api/auth/logout',
    '/jobs/abc',
    '/login',
    '/following/x',
    '/profile?tab=<script>',
    '/jobs?company=a b',
  ])
    expect(APP_PATH.test(bad)).toBe(false);
});
