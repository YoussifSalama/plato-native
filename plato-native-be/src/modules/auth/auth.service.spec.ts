jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('bcryptjs', () => {
  const real = jest.requireActual<typeof import('bcryptjs')>('bcryptjs');
  return {
    ...real,
    compare: jest.fn((s: string, h: string) => real.compare(s, h)),
  };
});

import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  it('an unknown email still runs a password check, so it answers as slowly as a wrong password', async () => {
    const svc = new AuthService(
      { findByEmail: async () => null } as never,
      {} as never,
      {} as never,
    );
    await expect(
      svc.login({ email: 'nobody@example.com', password: 'x' }),
    ).rejects.toThrow('Invalid email or password');
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });
});

// A stand-in for the users collection: phone is unique, as its index is.
function usersDb(rows: { id: string; phone: string }[]) {
  type Where = {
    phone?: string | { in: string[] };
    id?: { not: string };
  };
  const hit = (u: { id: string; phone: string }, w: Where) =>
    (typeof w.phone === 'string'
      ? u.phone === w.phone
      : !w.phone || w.phone.in.includes(u.phone)) &&
    (!w.id || u.id !== w.id.not);
  const user = {
    findMany: jest.fn(() => Promise.resolve(rows.map((r) => ({ ...r })))),
    findFirst: jest.fn(({ where }: { where: Where }) =>
      Promise.resolve(rows.find((u) => hit(u, where)) ?? null),
    ),
    update: jest.fn(
      ({ where, data }: { where: { id: string }; data: { phone: string } }) => {
        const row = rows.find((u) => u.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve({ ...row });
      },
    ),
  };
  return { user, rows };
}

describe('AuthService legacy phones (boot migration)', () => {
  it('normalizes a legacy phone, leaves a colliding pair and normalized phones untouched, never merges', async () => {
    const { user, rows } = usersDb([
      { id: 'a', phone: '201005550401' }, // legacy, nobody else has +201005550401
      { id: 'b', phone: '201005550402' }, // legacy, collides with c
      { id: 'c', phone: '+201005550402' },
      { id: 'd', phone: '+201005550403' }, // already normalized
      { id: 'e', phone: '01005550404' }, // local, no country code: no E.164 form to guess
    ]);
    const warn = jest.fn<void, [string]>();
    const svc = new AuthService({} as never, {} as never, { user } as never);
    Object.assign(svc, { logger: { warn } });
    await svc.normalizeLegacyPhones();
    expect(rows).toEqual([
      { id: 'a', phone: '+201005550401' },
      { id: 'b', phone: '201005550402' },
      { id: 'c', phone: '+201005550402' },
      { id: 'd', phone: '+201005550403' },
      { id: 'e', phone: '01005550404' },
    ]);
    expect(user.update).toHaveBeenCalledTimes(1);
    // one line naming both ids, never the number; one for the local number
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toContain('user e');
    expect(warn.mock.calls[0][0]).toContain('user b');
    expect(warn.mock.calls[0][0]).toContain('user c');
    expect(warn.mock.calls[0][0]).not.toContain('5550402');
    // idempotent: a second boot changes nothing more
    await svc.normalizeLegacyPhones();
    expect(user.update).toHaveBeenCalledTimes(1);
  });

  it('a sign-up or a phone change to a number a legacy row holds without the "+" is a 409', async () => {
    const { user } = usersDb([{ id: 'b', phone: '201005550402' }]);
    const create = jest.fn();
    const update = jest.fn();
    const svc = new AuthService(
      { findByEmail: () => Promise.resolve(null), create, update } as never,
      {} as never,
      { user } as never,
    );
    await expect(
      svc.signup({
        full_name: 'New',
        email: 'new@example.com',
        phone: '+201005550402',
        password: 'Passw0rd!x',
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      svc.updateMe('other', { phone: '+201005550402' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    // the legacy account itself may save its own number in the normalized form
    update.mockResolvedValue({ id: 'b', phone: '+201005550402' });
    await svc.updateMe('b', { phone: '+201005550402' });
    expect(update).toHaveBeenCalled();
  });
});
