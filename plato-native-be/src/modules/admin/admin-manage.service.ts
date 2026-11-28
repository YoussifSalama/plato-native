import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { z } from 'zod';
import { IEnvParams } from '../../types/config/env.types';
import { sha256 } from '../extension/extension-token';
import { actionEmail } from '../mail/action-email';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { GRANTABLE_PAGES } from './admin-pages';
import { AdminAuthService } from './admin-auth.service';
import type {
  createInviteSchema,
  createRoleSchema,
  updateAdminSchema,
  updateRoleSchema,
} from './admin.schema';

export const INVITE_TTL_MS = 3 * 3_600_000;
const SUPER_LOCKED = "The super admin can't be changed here.";

const grantable = new Set<string>(GRANTABLE_PAGES);
const cleanPages = (p: string[]) => p.filter((k) => grantable.has(k));

type AdminRow = Prisma.AdminUserGetPayload<{ include: { role: true } }>;
type InviteRow = Prisma.AdminInviteGetPayload<{ include: { role: true } }>;

const adminRow = (a: AdminRow) => ({
  id: a.id,
  email: a.email,
  isSuper: a.is_super,
  active: a.active,
  role: a.role ? { id: a.role.id, name: a.role.name } : null,
  totpEnabled: !!a.totp_secret,
  createdAt: a.created_at,
  lastLoginAt: a.last_login_at,
});

const inviteRow = (i: InviteRow, now = new Date()) => ({
  id: i.id,
  email: i.email,
  role: i.role ? { id: i.role.id, name: i.role.name } : null,
  status: i.used_at
    ? ('used' as const)
    : i.expires_at <= now
      ? ('expired' as const)
      : ('pending' as const),
  expiresAt: i.expires_at,
  createdAt: i.created_at,
});

const nameTaken = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    ? new ConflictException('A role with this name already exists.')
    : e;

/** Super admin only: admins, roles and invitations. */
@Injectable()
export class AdminManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly auth: AdminAuthService,
  ) {}

  // ---- admins ---------------------------------------------------------------

  async listAdmins() {
    const rows = await this.prisma.adminUser.findMany({
      include: { role: true },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(adminRow);
  }

  private async editable(id: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException();
    if (admin.is_super) throw new ForbiddenException(SUPER_LOCKED);
    return admin;
  }

  async updateAdmin(id: string, input: z.infer<typeof updateAdminSchema>) {
    const admin = await this.editable(id);
    if (input.roleId) {
      const role = await this.prisma.adminRole.findUnique({
        where: { id: input.roleId },
        select: { id: true },
      });
      if (!role) throw new BadRequestException('That role no longer exists.');
    }
    const turningOff = input.active === false && admin.active;
    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(input.active !== undefined && { active: input.active }),
        ...(input.roleId !== undefined && { role_id: input.roleId }),
        // Turned off: every session and half-way login ends, and stays ended if turned back on.
        ...(turningOff && { sessions_valid_after: new Date() }),
      },
      include: { role: true },
    });
    return adminRow(updated);
  }

  async resetTwoFactor(id: string) {
    await this.editable(id);
    await this.prisma.adminUser.update({
      where: { id },
      data: {
        totp_secret: null,
        totp_pending_secret: null,
        sessions_valid_after: new Date(),
      },
    });
    this.auth.forgetTotp(id);
    return { ok: true as const };
  }

  // ---- roles ----------------------------------------------------------------

  async listRoles() {
    const [roles, counts] = await Promise.all([
      this.prisma.adminRole.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.adminUser.groupBy({
        by: ['role_id'],
        _count: { _all: true },
      }),
    ]);
    const n = new Map(counts.map((c) => [c.role_id, c._count._all]));
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      pages: cleanPages(r.pages),
      adminCount: n.get(r.id) ?? 0,
    }));
  }

  private async roleRow(id: string) {
    const r = await this.prisma.adminRole.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    const adminCount = await this.prisma.adminUser.count({
      where: { role_id: id },
    });
    return { id: r.id, name: r.name, pages: cleanPages(r.pages), adminCount };
  }

  async createRole(input: z.infer<typeof createRoleSchema>) {
    try {
      const r = await this.prisma.adminRole.create({
        data: { name: input.name, pages: cleanPages(input.pages) },
      });
      return { id: r.id, name: r.name, pages: r.pages, adminCount: 0 };
    } catch (e) {
      throw nameTaken(e);
    }
  }

  async updateRole(id: string, input: z.infer<typeof updateRoleSchema>) {
    const found = await this.prisma.adminRole.findUnique({ where: { id } });
    if (!found) throw new NotFoundException();
    try {
      await this.prisma.adminRole.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.pages !== undefined && { pages: cleanPages(input.pages) }),
        },
      });
    } catch (e) {
      throw nameTaken(e);
    }
    return this.roleRow(id);
  }

  async deleteRole(id: string) {
    const found = await this.prisma.adminRole.findUnique({ where: { id } });
    if (!found) throw new NotFoundException();
    const [admins, invites] = await Promise.all([
      this.prisma.adminUser.count({ where: { role_id: id } }),
      this.prisma.adminInvite.count({
        where: { role_id: id, used_at: null, revoked_at: null },
      }),
    ]);
    if (admins)
      throw new ConflictException(
        'Admins still use this role. Move them to another role first.',
      );
    if (invites)
      throw new ConflictException(
        'Open invitations use this role. Revoke them first.',
      );
    await this.prisma.adminRole.delete({ where: { id } });
    return { ok: true as const };
  }

  // ---- invites --------------------------------------------------------------

  async listInvites() {
    const rows = await this.prisma.adminInvite.findMany({
      where: { revoked_at: null },
      include: { role: true },
      orderBy: { created_at: 'desc' },
    });
    const now = new Date();
    return rows.map((r) => inviteRow(r, now));
  }

  async createInvite(
    input: z.infer<typeof createInviteSchema>,
    invitedBy: string,
  ) {
    const env = this.config.get<IEnvParams>('env');
    if (env?.superAdminEmail && input.email === env.superAdminEmail)
      throw new BadRequestException("The super admin can't be invited.");
    const [role, admin] = await Promise.all([
      this.prisma.adminRole.findUnique({
        where: { id: input.roleId },
        select: { id: true },
      }),
      this.prisma.adminUser.findUnique({
        where: { email: input.email },
        select: { id: true },
      }),
    ]);
    if (!role) throw new BadRequestException('That role no longer exists.');
    if (admin) throw new ConflictException('This email is already an admin.');

    const now = new Date();
    // One live invitation per address: the newest.
    await this.prisma.adminInvite.updateMany({
      where: { email: input.email, used_at: null, revoked_at: null },
      data: { revoked_at: now },
    });
    const token = randomBytes(32).toString('base64url');
    const invite = await this.prisma.adminInvite.create({
      data: {
        email: input.email,
        role_id: role.id,
        token_hash: sha256(token),
        expires_at: new Date(now.getTime() + INVITE_TTL_MS),
        used_at: null,
        revoked_at: null,
        invited_by: invitedBy,
      },
      include: { role: true },
    });
    await this.sendInvite(invite.email, token);
    return inviteRow(invite);
  }

  async resendInvite(id: string) {
    const found = await this.prisma.adminInvite.findUnique({ where: { id } });
    if (!found || found.revoked_at) throw new NotFoundException();
    if (found.used_at)
      throw new ConflictException('This invitation was already used.');
    const token = randomBytes(32).toString('base64url');
    const invite = await this.prisma.adminInvite.update({
      where: { id },
      data: {
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + INVITE_TTL_MS),
      },
      include: { role: true },
    });
    await this.sendInvite(invite.email, token);
    return inviteRow(invite);
  }

  async revokeInvite(id: string) {
    const found = await this.prisma.adminInvite.findUnique({ where: { id } });
    if (!found || found.revoked_at) throw new NotFoundException();
    await this.prisma.adminInvite.update({
      where: { id },
      data: { revoked_at: new Date() },
    });
    return { ok: true as const };
  }

  private async sendInvite(email: string, token: string) {
    const base = (this.config.get<IEnvParams>('env')?.adminUrl ?? '').replace(
      /\/+$/,
      '',
    );
    const url = `${base}/signup?invite=${encodeURIComponent(token)}`;
    return this.mail.send({
      to: email,
      ...actionEmail({
        subject: "You're invited to Plato Admin",
        name: '',
        lines: [
          "You've been invited to the Plato admin panel.",
          'Create your account with this email address. The link works for 3 hours. A super admin turns your account on after you sign up.',
        ],
        button: 'Create your account',
        url,
        footer:
          "If you didn't expect this invitation, you can ignore this email.",
      }),
      category: 'admin-invite',
    });
  }
}
