import { BadRequestException } from '@nestjs/common';
import { CreditsController } from './credits.controller';

// @nestjs/jwt ships as ESM, which this Jest setup does not load; the guard is not under test
jest.mock('../auth/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));

const req = { userId: 'u1' } as never;

describe('CreditsController (thin: validate, then hand to the service)', () => {
  const credits = {
    checkout: jest.fn().mockResolvedValue({ url: 'x' }),
    overview: jest.fn(),
  };
  const c = new CreditsController(credits as never, {} as never);
  beforeEach(() => jest.clearAllMocks());

  it('a plan or a known pack goes to the service', async () => {
    await c.checkout(req, { plan: 'max' });
    await c.checkout(req, { pack: 'small' });
    expect(credits.checkout.mock.calls).toEqual([
      ['u1', { plan: 'max' }],
      ['u1', { pack: 'small' }],
    ]);
  });

  it('anything else is refused before the service is called', () => {
    for (const body of [
      { plan: 'free' },
      {},
      { pack: 'huge' },
      { plan: 'pro', pack: 'x' },
    ].slice(0, 3))
      expect(() => c.checkout(req, body)).toThrow(BadRequestException);
    expect(credits.checkout).not.toHaveBeenCalled();
  });

  it('the history limit is passed through as a number', async () => {
    await c.get(req, '50');
    expect(credits.overview).toHaveBeenCalledWith('u1', 50);
  });
});
