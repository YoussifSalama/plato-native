import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IEnvParams } from '../../types/config/env.types';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPageKey, pagesFor } from './admin-pages';
import { genericAuthError } from './admin-errors';
import { ADMIN_SESSION_COOKIE, AdminTokens } from './admin-tokens';

export type AdminRequest = Request & {
  admin: { id: string; email: string; isSuper: boolean; pages: string[] };
};

export const ADMIN_PAGE_METADATA = 'plato:admin-page';
const ANY_PAGE = '*';

/**
 * The page an admin endpoint belongs to: `@UseGuards(AdminGuard) @AdminPage('usage')`.
 * Several keys = any one of them is enough (a read another page needs too).
 */
export const AdminPage = (...keys: [AdminPageKey, ...AdminPageKey[]]) =>
  SetMetadata(ADMIN_PAGE_METADATA, keys.length === 1 ? keys[0] : keys);

/** Any signed-in admin, whatever their pages (auth/me, the page list). */
export const AdminAnyPage = () => SetMetadata(ADMIN_PAGE_METADATA, ANY_PAGE);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/**
 * Cross-site request forgery: a browser always sends Origin on a write. One
 * that is not the admin panel is refused, so a page on a sibling subdomain
 * (where the SameSite=Lax cookie still rides along) can't post a form here.
 * No Origin = not a browser, nothing to forge.
 */
export function assertAdminOrigin(req: Request, adminUrl: string) {
  if (READ_METHODS.has(req.method)) return;
  const origin = req.headers.origin;
  if (origin === undefined) return;
  const allowed = originOf(adminUrl);
  if (!allowed || origin !== allowed) throw new ForbiddenException();
}

/**
 * Admin session guard. Reloads the admin on every request (active, role pages,
 * sessions_valid_after), so deactivation, role edits and resets apply at once.
 * Fails closed: an endpoint without @AdminPage / @AdminAnyPage is super admin only.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly tokens: AdminTokens,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    assertAdminOrigin(req, this.config.get<IEnvParams>('env')?.adminUrl ?? '');

    const claims = await this.tokens.verifySession(
      req.cookies?.[ADMIN_SESSION_COOKIE],
    );
    if (!claims) throw genericAuthError();

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: claims.sub },
      include: { role: true },
    });
    const cutoff = admin?.sessions_valid_after?.getTime() ?? 0;
    if (!admin || !admin.active || !admin.totp_secret || claims.t < cutoff)
      throw genericAuthError();

    const pages = pagesFor(admin);
    const required = this.reflector.getAllAndOverride<string | string[] | undefined>(
      ADMIN_PAGE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const allowed =
      admin.is_super ||
      required === ANY_PAGE ||
      (typeof required === 'string' && pages.includes(required)) ||
      (Array.isArray(required) && required.some((p) => pages.includes(p)));
    if (!allowed)
      throw new ForbiddenException("You don't have access to this page.");

    req.admin = {
      id: admin.id,
      email: admin.email,
      isSuper: admin.is_super,
      pages,
    };
    return true;
  }
}
