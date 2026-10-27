import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthTokenKind } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { actionEmail } from '../mail/action-email';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { forgetSessions } from './jwt-auth.guard';

const RESET_TTL_MS = 60 * 60_000;
const VERIFY_TTL_MS = 3 * 86_400_000;
const SALT_ROUNDS = 10;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const appUrl = () =>
  (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');

// Password reset and email confirmation: one-time links by email. The link
// carries a random secret; only its hash is stored, it expires, and it works once.
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private async issue(userId: string, kind: AuthTokenKind, ttlMs: number) {
    // One live link per kind: a new one replaces the old.
    await this.prisma.authToken.deleteMany({
      where: { user_id: userId, kind, used_at: null },
    });
    const secret = randomBytes(32).toString('base64url');
    await this.prisma.authToken.create({
      data: {
        user_id: userId,
        kind,
        token_hash: sha256(secret),
        expires_at: new Date(Date.now() + ttlMs),
        used_at: null,
      },
    });
    return secret;
  }

  // Marks the link used and returns its user, or refuses. The conditional
  // update means a link opened twice at once still works only once.
  private async redeem(secret: string, kind: AuthTokenKind) {
    const row = await this.prisma.authToken.findUnique({
      where: { token_hash: sha256(secret) },
    });
    if (!row || row.kind !== kind || row.used_at || row.expires_at < new Date())
      throw new BadRequestException(
        'This link has expired or was already used. Ask for a new one.',
      );
    const claimed = await this.prisma.authToken.updateMany({
      where: { id: row.id, used_at: null },
      data: { used_at: new Date() },
    });
    if (!claimed.count)
      throw new BadRequestException(
        'This link has expired or was already used. Ask for a new one.',
      );
    return row.user_id;
  }

  /** Always answers the same way, so it can't be used to find out who has an account. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true };
    const secret = await this.issue(
      user.id,
      AuthTokenKind.RESET_PASSWORD,
      RESET_TTL_MS,
    );
    const sent = await this.mail.send({
      to: user.email,
      category: 'account',
      ...actionEmail({
        subject: 'Reset your Plato password',
        name: user.full_name,
        lines: [
          'Someone asked to reset the password for your Plato account. If it was you, choose a new one below.',
          'The link works once and expires in an hour.',
        ],
        button: 'Choose a new password',
        url: `${appUrl()}/reset-password?token=${secret}`,
        footer:
          "Didn't ask for this? Ignore this email: your password stays the same.",
      }),
    });
    if (!sent) this.logger.warn(`Reset email not sent for user ${user.id}`);
    return { ok: true };
  }

  /** New password; every session signed in before now is signed out. */
  async resetPassword(secret: string, password: string) {
    const userId = await this.redeem(secret, AuthTokenKind.RESET_PASSWORD);
    // Whole seconds: a JWT's issue time is in seconds, so a sign-in right after still counts.
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: await bcrypt.hash(password, SALT_ROUNDS),
        sessions_valid_after: now,
        // Opening a link sent to the address proves it, too.
        email_verified_at: now,
      },
    });
    await this.prisma.authToken.deleteMany({
      where: {
        user_id: userId,
        kind: AuthTokenKind.RESET_PASSWORD,
        used_at: null,
      },
    });
    forgetSessions(userId);
    return { ok: true };
  }

  async sendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email_verified_at) return { sent: false };
    const secret = await this.issue(
      user.id,
      AuthTokenKind.VERIFY_EMAIL,
      VERIFY_TTL_MS,
    );
    const sent = await this.mail.send({
      to: user.email,
      category: 'account',
      ...actionEmail({
        subject: 'Confirm your email for Plato',
        name: user.full_name,
        lines: [
          'Welcome to Plato. Confirm this is your email so we can send you job alerts and account messages.',
        ],
        button: 'Confirm my email',
        url: `${appUrl()}/verify-email?token=${secret}`,
        footer:
          "Didn't sign up for Plato? Ignore this email and nothing will happen.",
      }),
    });
    return { sent };
  }

  async verifyEmail(secret: string) {
    const userId = await this.redeem(secret, AuthTokenKind.VERIFY_EMAIL);
    await this.prisma.user.update({
      where: { id: userId },
      data: { email_verified_at: new Date() },
    });
    return { ok: true };
  }
}
