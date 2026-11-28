jest.mock('@nestjs/config', () => ({ ConfigService: class {} })); // ESM-only
jest.mock('bcryptjs', () => ({
  hashSync: (s: string) => `h:${s}`,
  hash: jest.fn((s: string) => Promise.resolve(`h:${s}`)),
  compare: jest.fn((s: string, h: string) => Promise.resolve(h === `h:${s}`)),
}));

import * as bcrypt from 'bcryptjs';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { createHash } from 'crypto';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard, AdminPage, AdminAnyPage } from './admin-auth.guard';
import { AdminManageService } from './admin-manage.service';
import {
  AdminTokens,
  ADMIN_SESSION_COOKIE,
  signHs256,
  verifyHs256,
} from './admin-tokens';
import { GENERIC_AUTH_MESSAGE } from './admin-errors';
import { adminTotpLimiter } from './admin-limits';
import { createRoleSchema, updateRoleSchema } from './admin.schema';
import { base32Decode, hotp, totpStep } from './totp';

const SUPER = 'boss@plato.test';
const KEY = 'k'.repeat(40);
const env = {
  jwtSecret: 'test-secret-'.repeat(4),
  superAdminEmail: SUPER,
  superAdminKey: KEY,
  adminUrl: 'https://admin.plato.test',
};
let liveEnv: typeof env = env;
const config = { get: () => liveEnv } as never;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ---- a small in-memory stand-in for the three admin collections -----------
type Row = Record<string, any>;
let seq = 0;
const oid = () => (++seq).toString(16).padStart(24, '0');

function fakePrisma() {
  const users: Row[] = [];
  const roles: Row[] = [];
  const invites: Row[] = [];
  const match = (r: Row, w: Row = {}): boolean =>
    Object.entries(w).every(([k, v]) =>
      k === 'OR' ? (v as Row[]).some((o) => match(r, o)) : (r[k] ?? null) === v,
    );
  const withRole = (u: Row, include?: Row) =>
    include?.role
      ? { ...u, role: roles.find((r) => r.id === u.role_id) ?? null }
      : { ...u };
  const table = (rows: Row[]) => ({
    findUnique: jest.fn(async ({ where, include }: Row) => {
      const r = rows.find((x) => match(x, where));
      return r ? withRole(r, include) : null;
    }),
    findFirst: jest.fn(async ({ where, orderBy }: Row) => {
      let hits = rows.filter((x) => match(x, where));
      if (orderBy?.created_at === 'desc')
        hits = [...hits].sort((a, b) => b.created_at - a.created_at);
      return hits[0] ? { ...hits[0] } : null;
    }),
    findMany: jest.fn(async ({ where, include }: Row = {}) =>
      rows.filter((x) => match(x, where)).map((x) => withRole(x, include)),
    ),
    count: jest.fn(
      async ({ where }: Row) => rows.filter((x) => match(x, where)).length,
    ),
    create: jest.fn(async ({ data, include }: Row) => {
      if (
        data.email &&
        rows === users &&
        users.some((u) => u.email === data.email)
      )
        throw new Error('unique');
      const r = { id: oid(), created_at: new Date(Date.now() + seq), ...data };
      rows.push(r);
      return withRole(r, include);
    }),
    update: jest.fn(async ({ where, data, include }: Row) => {
      const r = rows.find((x) => match(x, where));
      if (!r) throw new Error('not found');
      Object.assign(r, data);
      return withRole(r, include);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const hits = rows.filter((x) => match(x, where));
      hits.forEach((r) => Object.assign(r, data));
      return { count: hits.length };
    }),
    delete: jest.fn(async ({ where }: Row) => {
      rows.splice(
        rows.findIndex((x) => match(x, where)),
        1,
      );
    }),
  });
  return {
    users,
    roles,
    invites,
    prisma: {
      adminUser: table(users),
      adminRole: table(roles),
      adminInvite: table(invites),
    },
  };
}

function setup() {
  const db = fakePrisma();
  const tokens = new AdminTokens(config);
  const mail = { send: jest.fn(async () => true) };
  const auth = new AdminAuthService(
    db.prisma as never,
    tokens,
    config,
    mail as never,
  );
  const manage = new AdminManageService(
    db.prisma as never,
    config,
    mail as never,
    auth,
  );
  const guard = new AdminGuard(
    tokens,
    db.prisma as never,
    new Reflector(),
    config,
  );
  return { ...db, tokens, mail, auth, manage, guard };
}

async function expectGeneric(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({
    status: 401,
    message: GENERIC_AUTH_MESSAGE,
  });
}
const codeFor = (secret: string, step = totpStep()) =>
  hotp(base32Decode(secret), step);

function invite(db: ReturnType<typeof setup>, email: string, over: Row = {}) {
  const role = db.roles[0] ?? {
    id: oid(),
    name: 'Support',
    pages: ['users', 'logs'],
  };
  if (!db.roles.includes(role)) db.roles.push(role);
  const token = `tok-${oid()}`;
  const row = {
    id: oid(),
    email,
    role_id: role.id,
    token_hash: sha(token),
    expires_at: new Date(Date.now() + 3 * 3_600_000),
    used_at: null,
    revoked_at: null,
    created_at: new Date(Date.now() + seq),
    ...over,
  };
  db.invites.push(row);
  return { token, row, role };
}

beforeEach(() => {
  jest.clearAllMocks();
  liveEnv = env;
});

describe('admin signup', () => {
  it('super email without a key asks for the key, creates nothing', async () => {
    const s = setup();
    await expect(
      s.auth.signup({ email: SUPER, password: 'password123' }),
    ).resolves.toEqual({
      next: 'super_key',
    });
    expect(s.users).toHaveLength(0);
  });

  it('super email with a wrong key: generic 401, still one bcrypt', async () => {
    const s = setup();
    await expectGeneric(
      s.auth.signup({
        email: SUPER,
        password: 'password123',
        superKey: 'nope',
      }),
    );
    expect(bcrypt.hash).toHaveBeenCalledTimes(1);
    expect(s.users).toHaveLength(0);
  });

  it('super email with the right key: active super admin, then QR setup', async () => {
    const s = setup();
    const r = await s.auth.signup({
      email: SUPER,
      password: 'password123',
      superKey: KEY,
    });
    expect(r.next).toBe('totp_setup');
    expect(s.users[0]).toMatchObject({
      email: SUPER,
      is_super: true,
      active: true,
    });
    const claims = await s.tokens.verifyPending(
      (r as { pendingToken: string }).pendingToken,
    );
    expect(claims).toMatchObject({ sub: s.users[0].id, step: 'totp_setup' });
  });

  it('a second super signup is refused with the generic error', async () => {
    const s = setup();
    await s.auth.signup({
      email: SUPER,
      password: 'password123',
      superKey: KEY,
    });
    await expectGeneric(
      s.auth.signup({ email: SUPER, password: 'other-pass1', superKey: KEY }),
    );
    expect(s.users).toHaveLength(1);
  });

  it('no super admin possible when SUPER_ADMIN_KEY or SUPER_ADMIN_EMAIL is empty: generic 401, empty key never matches', async () => {
    for (const blank of [
      { superAdminKey: '' },
      { superAdminEmail: '' },
      { superAdminKey: '', superAdminEmail: '' },
    ]) {
      const s = setup();
      liveEnv = { ...env, ...blank };
      // with or without a key, even an empty one: never "super_key", never created
      for (const superKey of [undefined, '', KEY])
        await expectGeneric(
          s.auth.signup({ email: SUPER, password: 'password123', superKey }),
        );
      expect(s.users).toHaveLength(0);
      // super-reset can't match either, even with a super admin row present
      s.users.push({ id: oid(), email: SUPER, is_super: true, active: true });
      for (const superKey of ['', KEY])
        await expectGeneric(s.auth.superReset({ email: SUPER, superKey }));
      expect(s.prisma.adminUser.update).not.toHaveBeenCalled();
    }
  });

  it('no invitation: generic 401, same as every other failure, one bcrypt', async () => {
    const s = setup();
    await expectGeneric(
      s.auth.signup({ email: 'stranger@x.co', password: 'password123' }),
    );
    expect(bcrypt.hash).toHaveBeenCalledTimes(1);
    expect(s.users).toHaveLength(0);
  });

  it('valid invite link: inactive admin with the invited role, invite used, no notice mail', async () => {
    const s = setup();
    const { token, row, role } = invite(s, 'ana@x.co');
    await expect(
      s.auth.signup({
        email: 'ana@x.co',
        password: 'password123',
        inviteToken: token,
      }),
    ).resolves.toEqual({ next: 'pending_activation' });
    expect(s.users[0]).toMatchObject({
      email: 'ana@x.co',
      active: false,
      is_super: false,
      role_id: role.id,
    });
    expect(row.used_at).toBeInstanceOf(Date);
    expect(s.mail.send).not.toHaveBeenCalled();
  });

  it('an invite is single use', async () => {
    const s = setup();
    const { token } = invite(s, 'ana@x.co');
    await s.auth.signup({
      email: 'ana@x.co',
      password: 'password123',
      inviteToken: token,
    });
    await expectGeneric(
      s.auth.signup({
        email: 'ana@x.co',
        password: 'password123',
        inviteToken: token,
      }),
    );
    expect(s.users).toHaveLength(1);
  });

  it('plain signup with an invited email (link expired) keeps the role, and mails the address', async () => {
    const s = setup();
    const { row, role } = invite(s, 'bo@x.co', {
      expires_at: new Date(Date.now() - 1000),
    });
    await expect(
      s.auth.signup({ email: 'bo@x.co', password: 'password123' }),
    ).resolves.toEqual({
      next: 'pending_activation',
    });
    expect(s.users[0]).toMatchObject({ active: false, role_id: role.id });
    expect(row.used_at).toBeInstanceOf(Date);
    await new Promise((r) => setImmediate(r));
    expect(s.mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bo@x.co' }),
    );
  });

  it("a link for someone else's email, or a revoked invite, gives the generic error", async () => {
    const s = setup();
    const { token } = invite(s, 'ana@x.co');
    await expectGeneric(
      s.auth.signup({
        email: 'eve@x.co',
        password: 'password123',
        inviteToken: token,
      }),
    );
    invite(s, 'cy@x.co', { revoked_at: new Date() });
    await expectGeneric(
      s.auth.signup({ email: 'cy@x.co', password: 'password123' }),
    );
    expect(s.users).toHaveLength(0);
  });

  it('an email that is already an admin gets the generic error, not "taken"', async () => {
    const s = setup();
    s.users.push({
      id: oid(),
      email: 'ana@x.co',
      password_hash: 'h:x',
      active: true,
      is_super: false,
    });
    invite(s, 'ana@x.co');
    await expectGeneric(
      s.auth.signup({ email: 'ana@x.co', password: 'password123' }),
    );
  });
});

describe('admin login', () => {
  const user = (over: Row = {}) => ({
    id: oid(),
    email: 'ana@x.co',
    password_hash: 'h:right-password',
    is_super: false,
    active: true,
    role_id: null,
    totp_secret: null,
    totp_pending_secret: null,
    sessions_valid_after: null,
    ...over,
  });

  it('unknown email and wrong password: same generic error, one bcrypt compare each', async () => {
    const s = setup();
    s.users.push(user());
    await expectGeneric(
      s.auth.login({ email: 'nobody@x.co', password: 'right-password' }),
    );
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    await expectGeneric(s.auth.login({ email: 'ana@x.co', password: 'wrong' }));
    expect(bcrypt.compare).toHaveBeenCalledTimes(2);
  });

  it('INACTIVE only after the password is proven', async () => {
    const s = setup();
    s.users.push(user({ active: false }));
    await expectGeneric(s.auth.login({ email: 'ana@x.co', password: 'wrong' }));
    await expect(
      s.auth.login({ email: 'ana@x.co', password: 'right-password' }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'INACTIVE' },
    });
  });

  it('asks for QR setup first, the code once set up', async () => {
    const s = setup();
    s.users.push(user());
    expect(
      (await s.auth.login({ email: 'ana@x.co', password: 'right-password' }))
        .next,
    ).toBe('totp_setup');
    s.users[0].totp_secret = 'JBSWY3DPEHPK3PXP';
    expect(
      (await s.auth.login({ email: 'ana@x.co', password: 'right-password' }))
        .next,
    ).toBe('totp');
  });
});

describe('admin TOTP and sessions', () => {
  async function superPending(s: ReturnType<typeof setup>) {
    const r = (await s.auth.signup({
      email: SUPER,
      password: 'password123',
      superKey: KEY,
    })) as {
      pendingToken: string;
    };
    return (await s.tokens.verifyPending(r.pendingToken))!;
  }

  it('setup keeps the secret pending until the first good code, then gives a session', async () => {
    const s = setup();
    const claims = await superPending(s);
    const { secret, otpauthUrl } = await s.auth.totpSetup(claims);
    expect(otpauthUrl).toContain('issuer=Plato%20Admin');
    expect(s.users[0]).toMatchObject({
      totp_secret: null,
      totp_pending_secret: secret,
    });
    // a reload shows the same QR
    expect((await s.auth.totpSetup(claims)).secret).toBe(secret);

    const { sessionToken, me } = await s.auth.totpVerify(
      claims,
      codeFor(secret),
    );
    expect(s.users[0]).toMatchObject({
      totp_secret: secret,
      totp_pending_secret: null,
    });
    expect(me).toMatchObject({
      email: SUPER,
      isSuper: true,
      active: true,
      role: null,
    });
    expect(me.pages).toContain('admin');
    expect(await s.tokens.verifySession(sessionToken)).toMatchObject({
      sub: s.users[0].id,
    });
    // the pending token is spent
    await expectGeneric(
      s.auth.totpVerify(claims, codeFor(secret, totpStep() + 1)),
    );
  });

  it('five wrong codes kill the pending token, even for a right sixth', async () => {
    const s = setup();
    const claims = await superPending(s);
    const { secret } = await s.auth.totpSetup(claims);
    const right = codeFor(secret);
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await expectGeneric(s.auth.totpVerify(claims, wrong));
    await expectGeneric(s.auth.totpVerify(claims, right));
    adminTotpLimiter.reset(`pending:${claims.jti}`);
  });

  it('a code works once (no replay on a second login)', async () => {
    const s = setup();
    const claims = await superPending(s);
    const { secret } = await s.auth.totpSetup(claims);
    const code = codeFor(secret);
    await s.auth.totpVerify(claims, code);
    const again = (await s.tokens.verifyPending(
      (await s.auth.login({ email: SUPER, password: 'password123' }))
        .pendingToken,
    ))!;
    expect(again.step).toBe('totp');
    await expectGeneric(s.auth.totpVerify(again, code));
  });

  it('a pending token issued before a reset is dead', async () => {
    const s = setup();
    const claims = await superPending(s);
    s.users[0].sessions_valid_after = new Date(Date.now() + 1000);
    await expectGeneric(s.auth.totpSetup(claims));
  });

  it('super-reset: generic on a wrong key or a non-super email, clears 2FA with the key', async () => {
    const s = setup();
    const claims = await superPending(s);
    const { secret } = await s.auth.totpSetup(claims);
    await s.auth.totpVerify(claims, codeFor(secret));
    await expectGeneric(s.auth.superReset({ email: SUPER, superKey: 'wrong' }));
    await expectGeneric(
      s.auth.superReset({ email: 'ana@x.co', superKey: KEY }),
    );
    await expect(
      s.auth.superReset({
        email: SUPER,
        superKey: KEY,
        newPassword: 'brand-new-pass',
      }),
    ).resolves.toEqual({ ok: true });
    expect(s.users[0]).toMatchObject({
      totp_secret: null,
      password_hash: 'h:brand-new-pass',
    });
    expect(s.users[0].sessions_valid_after).toBeInstanceOf(Date);
  });
});

describe('AdminGuard', () => {
  class Ctl {
    any() {}
    usage() {}
    admin() {}
    none() {}
  }
  AdminAnyPage()(
    Ctl.prototype,
    'any',
    Object.getOwnPropertyDescriptor(Ctl.prototype, 'any')!,
  );
  AdminPage('usage')(
    Ctl.prototype,
    'usage',
    Object.getOwnPropertyDescriptor(Ctl.prototype, 'usage')!,
  );
  AdminPage('admin')(
    Ctl.prototype,
    'admin',
    Object.getOwnPropertyDescriptor(Ctl.prototype, 'admin')!,
  );

  const ctx = (
    handler: keyof Ctl,
    cookies: Row,
    headers: Row = {},
    method = 'GET',
  ) => {
    const req: Row = { cookies, headers, method };
    return {
      req,
      ctx: {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => Ctl.prototype[handler],
        getClass: () => Ctl,
      } as unknown as ExecutionContext,
    };
  };

  async function admin(s: ReturnType<typeof setup>, over: Row = {}) {
    const role = { id: oid(), name: 'Support', pages: ['usage', 'admin'] };
    s.roles.push(role);
    const u = {
      id: oid(),
      email: 'ana@x.co',
      is_super: false,
      active: true,
      role_id: role.id,
      totp_secret: 'JBSWY3DPEHPK3PXP',
      sessions_valid_after: null,
      ...over,
    } as Row;
    s.users.push(u);
    return {
      u,
      role,
      cookie: { [ADMIN_SESSION_COOKIE]: await s.tokens.signSession(u.id) },
    };
  }

  it('lets an admin into a page their role grants, sets req.admin, refuses other pages', async () => {
    const s = setup();
    const { u, cookie } = await admin(s);
    const ok = ctx('usage', cookie);
    await expect(s.guard.canActivate(ok.ctx)).resolves.toBe(true);
    expect(ok.req.admin).toEqual({
      id: u.id,
      email: u.email,
      isSuper: false,
      pages: ['usage'],
    });
    await expect(s.guard.canActivate(ctx('any', cookie).ctx)).resolves.toBe(
      true,
    );
    // "admin" in a role's stored pages is ignored: never grantable
    await expect(
      s.guard.canActivate(ctx('admin', cookie).ctx),
    ).rejects.toMatchObject({ status: 403 });
    // no @AdminPage at all: super admin only (fails closed)
    await expect(
      s.guard.canActivate(ctx('none', cookie).ctx),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('super admin passes every page', async () => {
    const s = setup();
    const { cookie } = await admin(s, { is_super: true, role_id: null });
    await expect(s.guard.canActivate(ctx('admin', cookie).ctx)).resolves.toBe(
      true,
    );
    await expect(s.guard.canActivate(ctx('none', cookie).ctx)).resolves.toBe(
      true,
    );
  });

  it('deactivation, a role edit and a session cut-off apply on the next request', async () => {
    const s = setup();
    const { u, role, cookie } = await admin(s);
    role.pages = ['logs'];
    await expect(
      s.guard.canActivate(ctx('usage', cookie).ctx),
    ).rejects.toMatchObject({ status: 403 });
    u.sessions_valid_after = new Date(Date.now() + 1000);
    await expectGeneric(s.guard.canActivate(ctx('any', cookie).ctx));
    u.sessions_valid_after = null;
    u.active = false;
    await expectGeneric(s.guard.canActivate(ctx('any', cookie).ctx));
  });

  it('refuses a seeker token, a pending token, and a token in the wrong cookie', async () => {
    const s = setup();
    const { u } = await admin(s, { is_super: true });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    // what the seeker's JwtService issues: HS256 with JWT_SECRET, no audience
    const seeker = signHs256(env.jwtSecret, { sub: u.id, exp });
    await expectGeneric(
      s.guard.canActivate(ctx('any', { [ADMIN_SESSION_COOKIE]: seeker }).ctx),
    );
    // right audience, but signed with the seeker key
    const forged = signHs256(env.jwtSecret, {
      sub: u.id,
      t: Date.now(),
      aud: 'plato-admin',
      exp,
    });
    await expectGeneric(
      s.guard.canActivate(ctx('any', { [ADMIN_SESSION_COOKIE]: forged }).ctx),
    );
    const pending = await s.tokens.signPending(u.id, 'totp');
    await expectGeneric(
      s.guard.canActivate(ctx('any', { [ADMIN_SESSION_COOKIE]: pending }).ctx),
    );
    const session = await s.tokens.signSession(u.id);
    await expectGeneric(
      s.guard.canActivate(ctx('any', { access_token: session }).ctx),
    );
    expect(await s.tokens.verifyPending(session)).toBeNull();
  });

  it('a write from a foreign origin is refused (CSRF), from the panel it passes', async () => {
    const s = setup();
    const { cookie } = await admin(s, { is_super: true });
    await expect(
      s.guard.canActivate(
        ctx('any', cookie, { origin: 'https://jobs.plato.test' }, 'POST').ctx,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      s.guard.canActivate(
        ctx('any', cookie, { origin: env.adminUrl }, 'POST').ctx,
      ),
    ).resolves.toBe(true);
  });
});

describe('admin token format', () => {
  it('HS256 verify: wrong key, wrong audience, expired, tampered, alg swap all fail', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const t = signHs256('k1', { sub: 'a', aud: 'plato-admin', exp });
    expect(verifyHs256('k1', t, 'plato-admin')).toMatchObject({ sub: 'a' });
    expect(verifyHs256('k2', t, 'plato-admin')).toBeNull();
    expect(verifyHs256('k1', t, 'plato-admin-pending')).toBeNull();
    expect(verifyHs256('k1', t, 'plato-admin', (exp + 1) * 1000)).toBeNull();
    const [h, , sig] = t.split('.');
    const evil = Buffer.from(
      JSON.stringify({ sub: 'b', aud: 'plato-admin', exp }),
    ).toString('base64url');
    expect(verifyHs256('k1', `${h}.${evil}.${sig}`, 'plato-admin')).toBeNull();
    const none = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    expect(
      verifyHs256('k1', `${none}.${t.split('.')[1]}.`, 'plato-admin'),
    ).toBeNull();
    expect(verifyHs256('k1', undefined, 'plato-admin')).toBeNull();
  });
});

describe('admin management rules', () => {
  it('the super admin cannot be edited, deactivated or 2FA-reset through the API', async () => {
    const s = setup();
    s.users.push({
      id: 'a'.repeat(24),
      email: SUPER,
      is_super: true,
      active: true,
    });
    await expect(
      s.manage.updateAdmin('a'.repeat(24), { active: false }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(s.manage.resetTwoFactor('a'.repeat(24))).rejects.toMatchObject(
      { status: 403 },
    );
    expect(s.users[0].active).toBe(true);
  });

  it('deactivating an admin cuts their sessions; reset-2fa clears the secret', async () => {
    const s = setup();
    s.users.push({
      id: 'b'.repeat(24),
      email: 'ana@x.co',
      is_super: false,
      active: true,
      totp_secret: 'X',
    });
    await s.manage.updateAdmin('b'.repeat(24), { active: false });
    expect(s.users[0].sessions_valid_after).toBeInstanceOf(Date);
    await s.manage.resetTwoFactor('b'.repeat(24));
    expect(s.users[0].totp_secret).toBeNull();
  });

  it('a role can never be given the admin page', () => {
    expect(
      createRoleSchema.safeParse({ name: 'X', pages: ['users', 'admin'] })
        .success,
    ).toBe(false);
    expect(updateRoleSchema.safeParse({ pages: ['admin'] }).success).toBe(
      false,
    );
    expect(
      createRoleSchema.parse({ name: ' X ', pages: ['users', 'users'] }),
    ).toEqual({
      name: 'X',
      pages: ['users'],
    });
  });

  it('invites store only the token hash, email the link, and cannot target the super admin', async () => {
    const s = setup();
    s.roles.push({ id: 'c'.repeat(24), name: 'Support', pages: [] });
    const row = await s.manage.createInvite(
      { email: 'new@x.co', roleId: 'c'.repeat(24) },
      'boss',
    );
    expect(row).toMatchObject({
      email: 'new@x.co',
      status: 'pending',
      role: { name: 'Support' },
    });
    const mail = (s.mail.send.mock.calls[0] as unknown as [Row])[0];
    const token = /invite=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
    expect(mail.text).toContain(`${env.adminUrl}/signup?invite=`);
    expect(s.invites[0].token_hash).toBe(sha(token));
    expect(JSON.stringify(s.invites[0])).not.toContain(token);
    await expect(
      s.manage.createInvite({ email: SUPER, roleId: 'c'.repeat(24) }, 'boss'),
    ).rejects.toMatchObject({ status: 400 });
  });
});
