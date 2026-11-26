import { HttpException } from '@nestjs/common';

// @nestjs/config and @nestjs/jwt ship as ESM, which this Jest setup does not load; neither runs here.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { AuthController } from './auth.controller';

describe('AuthController rate limits', () => {
  const auth = {
    login: jest.fn(async () => {
      throw new HttpException('Invalid credentials', 401);
    }),
    signup: jest.fn(async () => ({ token: 't', user: { id: 'u' } })),
  };
  const ctrl = new AuthController(
    auth as never,
    { get: () => ({ nodeEnv: 'test' }) } as never,
    {} as never,
    {} as never,
    { sendVerification: jest.fn(async () => ({ sent: false })) } as never,
  );
  const res = { cookie: jest.fn() } as never;
  const req = (ip: string) => ({ ip }) as never;
  const status = async (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: HttpException) => e.getStatus(),
    );

  it('one account from one address: the 11th try in 15 minutes is refused before the password is checked', async () => {
    const body = { email: 'Mona@Example.com', password: 'wrong-pass' };
    for (let i = 0; i < 10; i++)
      expect(await status(ctrl.login(req('10.0.0.1'), body, res))).toBe(401);
    auth.login.mockClear();
    expect(
      await status(
        ctrl.login(
          req('10.0.0.1'),
          { ...body, email: 'mona@example.com' },
          res,
        ),
      ),
    ).toBe(429);
    expect(auth.login).not.toHaveBeenCalled();
    // The owner, from their own address, is not locked out by a stranger knowing the email.
    expect(await status(ctrl.login(req('10.0.0.2'), body, res))).toBe(401);
  });

  it('a successful login clears the count for that account and address', async () => {
    const body = { email: 'lina@example.com', password: 'p' };
    for (let i = 0; i < 9; i++)
      await status(ctrl.login(req('10.0.2.1'), body, res));
    auth.login.mockResolvedValueOnce({
      token: 't',
      user: { id: 'u' },
    } as never);
    expect(await status(ctrl.login(req('10.0.2.1'), body, res))).toBe(200);
    for (let i = 0; i < 10; i++)
      expect(await status(ctrl.login(req('10.0.2.1'), body, res))).toBe(401);
  });

  it('one address: sign-ups are capped', async () => {
    const body = {
      full_name: 'A B',
      email: 'a@b.co',
      phone: '+201000000000',
      password: 'password123',
    };
    const codes: number[] = [];
    for (let i = 0; i < 11; i++)
      codes.push(await status(ctrl.signup(req('10.9.9.9'), body, res)));
    expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
