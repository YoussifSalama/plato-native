import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';
import { JwtAuthGuard } from './jwt-auth.guard';

type Row = Record<string, unknown>;

// The Prisma calls the service makes, in memory.
function fakeDb() {
  const users: Row[] = [
    {
      id: 'u1',
      email: 'mona@example.com',
      full_name: 'Mona Ali',
      password_hash: 'old',
      email_verified_at: null,
      sessions_valid_after: null,
    },
  ];
  const tokens: Row[] = [];
  const hit = (r: Row, w: Row) =>
    Object.entries(w).every(([k, v]) => (r[k] ?? null) === v);
  const db = {
    user: {
      findUnique: async ({ where }: { where: Row }) =>
        users.find((u) => hit(u, where)) ?? null,
      update: async ({ where, data }: { where: Row; data: Row }) =>
        Object.assign(
          users.find((u) => hit(u, where))!,
          data,
        ),
    },
    authToken: {
      deleteMany: async ({ where }: { where: Row }) => {
        for (let i = tokens.length - 1; i >= 0; i--)
          if (hit(tokens[i], where)) tokens.splice(i, 1);
      },
      create: async ({ data }: { data: Row }) =>
        tokens.push({ id: `t${tokens.length}`, ...data }),
      findUnique: async ({ where }: { where: Row }) =>
        tokens.find((t) => hit(t, where)) ?? null,
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const rows = tokens.filter((t) => hit(t, where));
        rows.forEach((t) => Object.assign(t, data));
        return { count: rows.length };
      },
    },
  };
  return { db, users, tokens };
}

function setup() {
  const f = fakeDb();
  const sent: { to: string; text: string }[] = [];
  const mail = {
    send: jest.fn(
      async (m: { to: string; text: string }) => (sent.push(m), true),
    ),
  };
  const svc = new AccountService(f.db as never, mail as never);
  const linkToken = () => /token=([\w-]+)/.exec(sent.at(-1)!.text)![1];
  return { ...f, svc, mail, sent, linkToken };
}

describe('password reset', () => {
  it('an unknown address gets the same answer and no email (no way to find who has an account)', async () => {
    const { svc, mail } = setup();
    expect(await svc.forgotPassword('nobody@example.com')).toEqual({
      ok: true,
    });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('the emailed link sets a new password once; only a hash of it is stored', async () => {
    const { svc, users, tokens, linkToken } = setup();
    await svc.forgotPassword('mona@example.com');
    const token = linkToken();
    expect(tokens[0].token_hash).not.toBe(token);
    await svc.resetPassword(token, 'new-password-1');
    expect(
      await bcrypt.compare('new-password-1', users[0].password_hash as string),
    ).toBe(true);
    expect(users[0].sessions_valid_after).toBeInstanceOf(Date);
    await expect(
      svc.resetPassword(token, 'another-pass'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('an expired link, or a confirmation link used for a reset, is refused', async () => {
    const { svc, tokens, linkToken } = setup();
    await svc.forgotPassword('mona@example.com');
    tokens[0].expires_at = new Date(Date.now() - 1000);
    await expect(
      svc.resetPassword(linkToken(), 'new-password-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await svc.sendVerification('u1');
    await expect(
      svc.resetPassword(linkToken(), 'new-password-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a new reset link replaces the old one', async () => {
    const { svc, linkToken } = setup();
    await svc.forgotPassword('mona@example.com');
    const first = linkToken();
    await svc.forgotPassword('mona@example.com');
    await expect(
      svc.resetPassword(first, 'new-password-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.resetPassword(linkToken(), 'new-password-1'),
    ).resolves.toEqual({ ok: true });
  });
});

describe('email confirmation', () => {
  it('the link confirms the address once; a confirmed address gets no more links', async () => {
    const { svc, users, mail, linkToken } = setup();
    await svc.sendVerification('u1');
    await svc.verifyEmail(linkToken());
    expect(users[0].email_verified_at).toBeInstanceOf(Date);
    mail.send.mockClear();
    expect(await svc.sendVerification('u1')).toEqual({ sent: false });
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('JwtAuthGuard after a reset', () => {
  it('a session issued before the reset is refused; one issued after works', async () => {
    const { svc, db, linkToken } = setup();
    PrismaService.instance = db as never;
    const iat = Math.floor(Date.now() / 1000) - 3600;
    const guard = (claims: object) =>
      new JwtAuthGuard({
        verifyAsync: async () => claims,
      } as never).canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ cookies: { access_token: 'x' } }),
        }),
      } as never);
    await expect(guard({ sub: 'u1', iat })).resolves.toBe(true);
    await svc.forgotPassword('mona@example.com');
    await svc.resetPassword(linkToken(), 'new-password-1');
    await expect(guard({ sub: 'u1', iat })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard({ sub: 'u1', iat: Math.floor(Date.now() / 1000) }),
    ).resolves.toBe(true);
    PrismaService.instance = undefined;
  });
});
