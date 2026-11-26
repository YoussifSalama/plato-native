import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthTokenKind } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { actionEmail } from '../mail/action-email';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import {
  accountIds,
  deleteAccountRows,
  exportAccountRows,
  STORAGE_PREFIXES,
} from '../user/account-data';
import { forgetSessions } from './jwt-auth.guard';

const RESET_TTL_MS = 60 * 60_000;
const CHANGE_EMAIL_TTL_MS = 86_400_000;
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
    private readonly storage: StorageService,
  ) {}

  private async issue(
    userId: string,
    kind: AuthTokenKind,
    ttlMs: number,
    email: string | null = null,
  ) {
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
        email,
      },
    });
    return secret;
  }

  // Marks the link used and returns its user, or refuses. The conditional
  // update means a link opened twice at once still works only once.
  private async redeem(secret: string, ...kinds: AuthTokenKind[]) {
    const row = await this.prisma.authToken.findUnique({
      where: { token_hash: sha256(secret) },
    });
    if (
      !row ||
      !kinds.includes(row.kind) ||
      row.used_at ||
      row.expires_at < new Date()
    )
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
    return row;
  }

  // Signs out every session issued before now, and every linked browser extension.
  // Whole seconds: a JWT's issue time is in seconds, so a sign-in right after still counts.
  private async endSessions(userId: string, data: object = {}) {
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { ...data, sessions_valid_after: now },
    });
    forgetSessions(userId);
    const seeker = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (seeker)
      await this.prisma.extensionDevice.updateMany({
        where: { job_seeker_id: seeker.id, revoked_at: null },
        data: { revoked_at: now },
      });
    return now;
  }

  private async checkPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      throw new UnauthorizedException('That password is not right');
    return user;
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
    const { user_id: userId } = await this.redeem(
      secret,
      AuthTokenKind.RESET_PASSWORD,
    );
    await this.endSessions(userId, {
      password_hash: await bcrypt.hash(password, SALT_ROUNDS),
      // Opening a link sent to the address proves it, too.
      email_verified_at: new Date(),
    });
    await this.prisma.authToken.deleteMany({
      where: {
        user_id: userId,
        kind: AuthTokenKind.RESET_PASSWORD,
        used_at: null,
      },
    });
    return { ok: true };
  }

  /** Settings → Security. Every other session and linked browser is signed out; the caller re-issues this one's cookie. */
  async changePassword(userId: string, current: string, next: string) {
    await this.checkPassword(userId, current);
    await this.endSessions(userId, {
      password_hash: await bcrypt.hash(next, SALT_ROUNDS),
    });
    return { ok: true };
  }

  /** "Sign out everywhere": every session, this one included, and every linked browser. */
  async signOutEverywhere(userId: string) {
    await this.endSessions(userId);
    return { ok: true };
  }

  /** A link to the new address; the account's email changes only when it is opened. */
  async requestEmailChange(userId: string, email: string, password: string) {
    const user = await this.checkPassword(userId, password);
    if (email === user.email)
      throw new BadRequestException('That is already your email');
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw new ConflictException('Email is already registered');
    const secret = await this.issue(
      userId,
      AuthTokenKind.CHANGE_EMAIL,
      CHANGE_EMAIL_TTL_MS,
      email,
    );
    const sent = await this.mail.send({
      to: email,
      category: 'account',
      ...actionEmail({
        subject: 'Confirm your new email for Plato',
        name: user.full_name,
        lines: [
          `You asked to use this address for your Plato account instead of ${user.email}. Confirm it below and it becomes your login and the email on your applications.`,
          'The link works once and expires in a day.',
        ],
        button: 'Use this email',
        url: `${appUrl()}/verify-email?token=${secret}`,
        footer:
          "Didn't ask for this? Ignore this email: the account's email stays the same.",
      }),
    });
    if (!sent)
      this.logger.warn(`Change-email link not sent for user ${userId}`);
    return { sent };
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

  // The welcome email's link, and the link sent to a new address (the swap happens here).
  async verifyEmail(secret: string) {
    const row = await this.redeem(
      secret,
      AuthTokenKind.VERIFY_EMAIL,
      AuthTokenKind.CHANGE_EMAIL,
    );
    const email = row.kind === AuthTokenKind.CHANGE_EMAIL ? row.email : null;
    if (email && (await this.prisma.user.findUnique({ where: { email } })))
      throw new ConflictException('Email is already registered');
    await this.prisma.user.update({
      where: { id: row.user_id },
      data: { email_verified_at: new Date(), ...(email && { email }) },
    });
    return email ? { ok: true, email } : { ok: true };
  }

  /** Everything the person gave Plato or Plato made for them, as one JSON object. */
  async exportData(userId: string) {
    return {
      exported_at: new Date().toISOString(),
      ...(await exportAccountRows(
        this.prisma,
        await accountIds(this.prisma, userId),
      )),
    };
  }

  /** Deletes the account and everything that belongs to it: rows, then files. Asks for the password first. */
  async deleteAccount(userId: string, password: string) {
    await this.checkPassword(userId, password);
    const ids = await accountIds(this.prisma, userId);
    // Files first: if storage is down nothing is deleted and the person can try again,
    // rather than an account gone with its CVs still in the bucket.
    const keys = ids.seekerId
      ? (
          await this.prisma.jobSeekerDocument.findMany({
            where: { job_seeker_id: ids.seekerId },
            select: { storage_key: true },
          })
        ).map((d) => d.storage_key)
      : [];
    try {
      // A CV brought from the guest search keeps its guests/ key; the rest sit under the seeker's folders.
      for (const key of keys) await this.storage.delete(key);
      if (ids.seekerId)
        for (const p of STORAGE_PREFIXES)
          await this.storage.deletePrefix(`${p}/${ids.seekerId}/`);
    } catch (err) {
      this.logger.error(
        `Account delete: storage failed for ${userId}: ${String(err)}`,
      );
      throw new ServiceUnavailableException(
        'We could not delete your files right now. Nothing was deleted: try again in a few minutes.',
      );
    }
    const counts = await deleteAccountRows(this.prisma, ids);
    forgetSessions(userId);
    this.logger.log(`Account ${userId} deleted: ${JSON.stringify(counts)}`);
    return { ok: true };
  }
}
