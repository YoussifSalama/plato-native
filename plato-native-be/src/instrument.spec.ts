import type { ErrorEvent } from '@sentry/nestjs';
import { scrub } from './instrument';

describe('error reports leave out private data', () => {
  it('drops bodies, cookies, query strings, auth headers and user details', () => {
    const event = scrub({
      type: undefined,
      request: {
        url: 'https://api/x',
        data: { password: 'hunter2', cv: '...' },
        cookies: { access_token: 'jwt' },
        query_string: 'token=secret',
        headers: {
          cookie: 'a',
          Authorization: 'Bearer t',
          'x-admin-key': 'k',
          'user-agent': 'UA',
        },
      },
      user: { id: 'u1', email: 'mona@example.com', ip_address: '1.2.3.4' },
    } as ErrorEvent);
    expect(event.request).toEqual({
      url: 'https://api/x',
      headers: { 'user-agent': 'UA' },
    });
    expect(event.user).toEqual({ id: 'u1' });
  });
});
