import { lastValueFrom, of } from 'rxjs';
import { AdminAuditInterceptor } from './admin-audit.interceptor';

const flush = () => new Promise((r) => setImmediate(r));

function run(req: Record<string, unknown>, result: unknown = { ok: true }) {
  const create = jest
    .fn<Promise<object>, [{ data: Record<string, unknown> }]>()
    .mockResolvedValue({});
  const i = new AdminAuditInterceptor({ adminAuditLog: { create } } as never);
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
  return {
    create,
    done: lastValueFrom(i.intercept(ctx, { handle: () => of(result) })),
  };
}

describe('admin audit log', () => {
  it('records a write: who, the route (not the URL), the ids and the body without secrets', async () => {
    const { create, done } = run({
      method: 'POST',
      originalUrl: '/admin/users/6650aaaaaaaaaaaaaaaaaaaa/block',
      route: { path: '/admin/users/:id/block' },
      params: { id: '6650aaaaaaaaaaaaaaaaaaaa' },
      body: { reason: 'spam', password: 'x' },
      query: {},
      ip: '1.2.3.4',
      admin: { id: 'a1', email: 'boss@plato.test' },
    });
    await done;
    await flush();
    expect(create.mock.calls[0][0].data).toMatchObject({
      admin_id: 'a1',
      admin_email: 'boss@plato.test',
      action: 'POST /admin/users/:id/block',
      target: { id: '6650aaaaaaaaaaaaaaaaaaaa' },
      detail: { reason: 'spam', password: '[redacted]' },
      ip: '1.2.3.4',
    });
  });

  it('skips reads and the sign-in steps before TOTP', async () => {
    for (const req of [
      { method: 'GET', originalUrl: '/admin/users', admin: { id: 'a1' } },
      {
        method: 'POST',
        originalUrl: '/admin/auth/login',
        body: { email: 'x', password: 'y' },
      },
    ]) {
      const { create, done } = run(req);
      await done;
      await flush();
      expect(create).not.toHaveBeenCalled();
    }
  });

  it('a finished sign-in is recorded with the admin from the response, without the code', async () => {
    const { create, done } = run(
      {
        method: 'POST',
        originalUrl: '/admin/auth/totp/verify',
        body: { code: '123456' },
        params: {},
        query: {},
      },
      { id: 'a2', email: 'helper@plato.test' },
    );
    await done;
    await flush();
    expect(create.mock.calls[0][0].data).toMatchObject({
      admin_id: 'a2',
      admin_email: 'helper@plato.test',
      detail: { code: '[redacted]' },
    });
  });
});
