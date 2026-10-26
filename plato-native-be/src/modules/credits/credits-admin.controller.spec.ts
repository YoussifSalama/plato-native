import { NotFoundException } from '@nestjs/common';
import { CreditsAdminController } from './credits-admin.controller';

// @nestjs/config ships as ESM, which this Jest setup does not load; only its type is used
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

const config = (key: string) => ({ get: () => ({ adminReportKey: key }) });

describe('admin credits routes', () => {
  it('without the admin key they do not exist (404), and neither without a configured key', async () => {
    const prisma = { user: { findFirst: jest.fn() } };
    const c = new CreditsAdminController(
      prisma as never,
      config('secret-key') as never,
    );
    await expect(c.report(undefined, '30')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      c.adjust('wrong-key!', 'a@b.c', { amount: 5, reason: 'xyz' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const none = new CreditsAdminController(
      prisma as never,
      config('') as never,
    );
    await expect(none.report('', '30')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a bad adjustment or an unknown plan before touching anything', async () => {
    const prisma = { user: { findFirst: jest.fn() } };
    const c = new CreditsAdminController(
      prisma as never,
      config('secret-key') as never,
    );
    await expect(
      c.adjust('secret-key', 'a@b.c', { amount: 'lots', reason: 'x' }),
    ).rejects.toThrow();
    await expect(
      c.plan('secret-key', 'a@b.c', { plan: 'platinum' }),
    ).rejects.toThrow();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('an unknown seeker is a 404', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    const c = new CreditsAdminController(
      prisma as never,
      config('secret-key') as never,
    );
    await expect(
      c.show('secret-key', 'nobody@example.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
