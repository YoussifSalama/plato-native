import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'crypto';
import { IEnvParams } from '../../types/config/env.types';
import { sha256 } from '../extension/extension-token';
import { MailService } from '../mail/mail.service';
import { actionEmail } from '../mail/action-email';
import { PrismaService } from '../prisma/prisma.service';
import { pagesFor } from './admin-pages';
import { genericAuthError, inactiveError } from './admin-errors';
import { adminTotpLimiter } from './admin-limits';
import type {
  AdminLoginInput,
  AdminSignupInput,
  SuperResetInput,
} from './admin.schema';
import {
  ADMIN_PENDING_MS,
  AdminPendingClaims,
  AdminTokens,
  PendingStep,
} from './admin-tokens';
import { newTotpSecret, otpauthUrl, verifyTotp } from './totp';

const SALT_ROUNDS = 12;
// Compared or hashed on every failing path, so a miss costs what a hit costs.
const DUMMY_HASH = bcrypt.hashSync('no-admin-with-this-email', SALT_ROUNDS);
export const MAX_CODES_PER_PENDING = 5;

const digest = (s: string) => createHash('sha256').update(s).digest();
/** Timing-safe, and the expected key's length doesn't leak either. */
export const keyMatches = (given: string | undefined, expected: string) =>
  !!expected && !!given && timingSafeEqual(digest(given), digest(expected));

type AdminWithRole = Prisma.AdminUserGetPayload<{ include: { role: true } }>;

export interface Me {
  id: string;
  email: string;
  isSuper: boolean;
  active: boolean;
  role: { id: string; name: string } | null;
  pages: string[];
}

export const toMe = (a: AdminWithRole): Me => ({
  id: a.id,
  email: a.email,
  isSuper: a.is_super,
  active: a.active,
  role: a.role ? { id: a.role.id, name: a.role.name } : null,
  pages: pagesFor(a),
});

export type SignupResult =
  | { next: 'super_key' }
  | { next: 'totp_setup'; pendingToken: string }
  | { next: 'pending_activation' };

const uniqueHit = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  // ponytail: in memory, per process: pending tokens already used for a session (a defence on
  // top of the code's step, which is claimed in the database and so holds on every instance).
  private readonly usedPending = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AdminTokens,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private env() {
    const e = this.config.get<IEnvParams>('env');
    return {
      superEmail: e?.superAdminEmail ?? '',
      superKey: e?.superAdminKey ?? '',
      adminUrl: (e?.adminUrl ?? '').replace(/\/+$/, ''),
    };
  }

  async signup(input: AdminSignupInput): Promise<SignupResult> {
    const env = this.env();
    if (env.superEmail && input.email === env.superEmail) {
      // No SUPER_ADMIN_KEY configured: no super admin can be made, and an
      // empty key never matches. Same answer, same bcrypt, as any failure.
      if (!env.superKey) {
        await bcrypt.hash(input.password, SALT_ROUNDS);
        throw genericAuthError();
      }
      if (!input.superKey) return { next: 'super_key' };
      const keyOk = keyMatches(input.superKey, env.superKey);
      const taken = await this.prisma.adminUser.findFirst({
        where: { OR: [{ is_super: true }, { email: input.email }] },
        select: { id: true },
      });
      const password_hash = await bcrypt.hash(input.password, SALT_ROUNDS);
      if (!keyOk || taken) throw genericAuthError();
      try {
        const admin = await this.prisma.adminUser.create({
          data: {
            email: input.email,
            password_hash,
            is_super: true,
            active: true,
            role_id: null,
            totp_secret: null,
            totp_pending_secret: null,
            sessions_valid_after: null,
            last_login_at: null,
          },
        });
        return {
          next: 'totp_setup',
          pendingToken: await this.tokens.signPending(admin.id, 'totp_setup'),
        };
      } catch (e) {
        if (uniqueHit(e)) throw genericAuthError();
        throw e;
      }
    }

    // Hashed before any decision: every outcome costs one bcrypt.
    const password_hash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const now = new Date();
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    // A valid link for this address; else (no link, expired, someone else's)
    // the newest open invitation for the address, expired or not: the owner
    // wants the invited role kept. Revoked and used ones never count.
    let invite: { id: string; role_id: string | null } | null = null;
    let viaLink = false;
    if (input.inviteToken) {
      const byToken = await this.prisma.adminInvite.findUnique({
        where: { token_hash: sha256(input.inviteToken) },
      });
      if (
        byToken &&
        !byToken.used_at &&
        !byToken.revoked_at &&
        byToken.expires_at > now &&
        byToken.email === input.email
      ) {
        invite = byToken;
        viaLink = true;
      }
    }
    invite ??= await this.prisma.adminInvite.findFirst({
      where: { email: input.email, used_at: null, revoked_at: null },
      orderBy: { created_at: 'desc' },
    });
    if (!invite || existing) throw genericAuthError();

    // Single use: only the request that flips used_at goes on.
    const claimed = await this.prisma.adminInvite.updateMany({
      where: { id: invite.id, used_at: null, revoked_at: null },
      data: { used_at: now },
    });
    if (claimed.count !== 1) throw genericAuthError();

    const role = invite.role_id
      ? await this.prisma.adminRole.findUnique({
          where: { id: invite.role_id },
          select: { id: true },
        })
      : null;
    try {
      await this.prisma.adminUser.create({
        data: {
          email: input.email,
          password_hash,
          is_super: false,
          active: false,
          role_id: role?.id ?? null,
          totp_secret: null,
          totp_pending_secret: null,
          sessions_valid_after: null,
          last_login_at: null,
        },
      });
    } catch (e) {
      if (uniqueHit(e)) throw genericAuthError();
      throw e;
    }
    // Other open invitations for the address are spent too.
    await this.prisma.adminInvite.updateMany({
      where: { email: input.email, used_at: null, revoked_at: null },
      data: { revoked_at: now },
    });
    // Without the link nothing proved the mailbox: tell its owner, so a
    // stranger claiming the invitation doesn't go unnoticed.
    if (!viaLink) void this.notifyClaimed(input.email).catch(() => undefined);
    return { next: 'pending_activation' };
  }

  private async notifyClaimed(email: string) {
    const env = this.env();
    await this.mail.send({
      to: email,
      ...actionEmail({
        subject: 'Your Plato Admin account was created',
        name: '',
        lines: [
          'An admin account was just created with this email address. It stays off until a super admin activates it.',
          "If this wasn't you, tell your Plato super admin before they activate it.",
        ],
        button: 'Open Plato Admin',
        url: env.adminUrl || 'https://platohiring.com',
        footer: 'You got this email because you were invited to Plato Admin.',
      }),
      category: 'admin-auth',
    });
  }

  async login(input: AdminLoginInput) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: input.email },
    });
    const ok = await bcrypt.compare(
      input.password,
      admin?.password_hash ?? DUMMY_HASH,
    );
    if (!admin || !ok) throw genericAuthError();
    if (!admin.active) throw inactiveError();
    const next: PendingStep = admin.totp_secret ? 'totp' : 'totp_setup';
    return {
      next,
      pendingToken: await this.tokens.signPending(admin.id, next),
    };
  }

  /** The admin behind a half-way login, if that login is still good. */
  private async pendingAdmin(claims: AdminPendingClaims) {
    if (this.usedPending.has(claims.jti)) throw genericAuthError();
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: claims.sub },
      include: { role: true },
    });
    if (!admin) throw genericAuthError();
    // A reset or deactivation after the password step ends it.
    if (claims.t < (admin.sessions_valid_after?.getTime() ?? 0))
      throw genericAuthError();
    if (!admin.active) throw inactiveError();
    return admin;
  }

  async totpSetup(claims: AdminPendingClaims) {
    const admin = await this.pendingAdmin(claims);
    if (claims.step !== 'totp_setup' || admin.totp_secret)
      throw genericAuthError();
    let secret = admin.totp_pending_secret;
    if (!secret) {
      secret = newTotpSecret();
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { totp_pending_secret: secret },
      });
    }
    return { otpauthUrl: otpauthUrl(admin.email, secret), secret };
  }

  async totpVerify(claims: AdminPendingClaims, code: string) {
    // Five codes per half-way login, then it is dead.
    if (
      !adminTotpLimiter.hit(
        `pending:${claims.jti}`,
        MAX_CODES_PER_PENDING,
        ADMIN_PENDING_MS,
      )
    )
      throw genericAuthError();
    const admin = await this.pendingAdmin(claims);
    const setup = claims.step === 'totp_setup';
    const secret = setup ? admin.totp_pending_secret : admin.totp_secret;
    if (!secret || (setup && admin.totp_secret)) throw genericAuthError();

    const step = verifyTotp(secret, code);
    if (step === null) throw genericAuthError();
    // A code works once: claim its time step on the admin row. Only a newer step than the last one
    // accepted wins, atomically, so the same code is refused here and on any other API instance.
    const claimed = await this.prisma.adminUser.updateMany({
      where: {
        id: admin.id,
        OR: [
          { totp_last_step: { isSet: false } },
          { totp_last_step: null },
          { totp_last_step: { lt: step } },
        ],
      },
      data: { totp_last_step: step },
    });
    if (claimed.count !== 1) throw genericAuthError();
    this.markUsed(claims.jti);

    const updated = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        last_login_at: new Date(),
        ...(setup && { totp_secret: secret, totp_pending_secret: null }),
      },
      include: { role: true },
    });
    return {
      sessionToken: await this.tokens.signSession(admin.id),
      me: toMe(updated),
    };
  }

  private markUsed(jti: string) {
    const now = Date.now();
    if (this.usedPending.size > 10_000)
      for (const [k, exp] of this.usedPending)
        if (exp <= now) this.usedPending.delete(k);
    this.usedPending.set(jti, now + ADMIN_PENDING_MS);
  }

  async me(adminId: string): Promise<Me> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      include: { role: true },
    });
    if (!admin) throw genericAuthError();
    return toMe(admin);
  }

  /** Lost phone (or password) of the super admin, proven with SUPER_ADMIN_KEY. */
  async superReset(input: SuperResetInput) {
    const env = this.env();
    const emailOk = !!env.superEmail && input.email === env.superEmail;
    const keyOk = keyMatches(input.superKey, env.superKey);
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: input.email },
      select: { id: true, is_super: true },
    });
    // One bcrypt whatever happens.
    const password_hash = await bcrypt.hash(
      input.newPassword ?? 'no-new-password',
      SALT_ROUNDS,
    );
    if (!emailOk || !keyOk || !admin?.is_super) throw genericAuthError();
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        totp_secret: null,
        totp_pending_secret: null,
        totp_last_step: null,
        sessions_valid_after: new Date(),
        ...(input.newPassword && { password_hash }),
      },
    });
    this.logger.warn(`super admin ${admin.id}: 2FA reset with the super key`);
    return { ok: true as const };
  }

  /** Every session issued to this admin until now is refused from here on (logout). */
  async endSessions(adminId: string) {
    await this.prisma.adminUser
      .update({
        where: { id: adminId },
        data: { sessions_valid_after: new Date() },
      })
      .catch(() => undefined); // already gone: nothing to end
  }
}
