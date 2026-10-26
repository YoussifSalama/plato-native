import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreditsController } from './credits.controller';
import { creditAccount } from './credits';

jest.mock('./credits', () => ({ creditAccount: jest.fn() }));
// @nestjs/jwt ships as ESM, which this Jest setup does not load; the guard is not under test
jest.mock('../auth/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));

const req = { userId: 'u1' } as never;
const c = new CreditsController({} as never);

describe('checkout', () => {
  beforeEach(() => {
    delete process.env.PAYMENTS_PROVIDER;
    (creditAccount as jest.Mock).mockResolvedValue({ plan: 'free' });
  });

  it('only Pro or Max, and not the plan the seeker already has', async () => {
    await expect(c.checkout(req, { plan: 'free' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(c.checkout(req, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    (creditAccount as jest.Mock).mockResolvedValue({ plan: 'pro' });
    await expect(c.checkout(req, { plan: 'pro' })).rejects.toThrow(
      'already on Pro',
    );
  });

  it('a top-up pack goes to checkout too; an unknown pack is refused', async () => {
    const err = (await c
      .checkout(req, { pack: 'medium' })
      .catch((e: unknown) => e)) as ServiceUnavailableException;
    expect(err.getResponse()).toMatchObject({ code: 'payments_unavailable' });
    await expect(c.checkout(req, { pack: 'huge' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('says payments are not open while no provider is connected (never pretends to upgrade)', async () => {
    const err = (await c
      .checkout(req, { plan: 'max' })
      .catch((e: unknown) => e)) as ServiceUnavailableException;
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.getResponse()).toMatchObject({ code: 'payments_unavailable' });
  });
});
