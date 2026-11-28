import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { capData } from '../error-log/error-log';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminRequest } from './admin-auth.guard';

const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
// Signed-out admin routes worth keeping: a finished sign-in and a super-key reset.
const AUTH_EVENTS = new Set([
  '/admin/auth/totp/verify',
  '/admin/auth/super-reset',
]);

/** The route as declared ("/admin/users/:id/block"), never the filled-in URL. */
const routeOf = (req: Request) => {
  const route = (req as unknown as { route?: { path?: unknown } }).route;
  const r = typeof route?.path === 'string' ? route.path : undefined;
  return r
    ? r.startsWith('/')
      ? r
      : `/${r}`
    : (req.originalUrl ?? req.url ?? '').split('?')[0];
};

/**
 * Records every successful admin write (and sign-ins / super-key resets) in admin_audit_logs.
 * Only after the handler succeeded; a failed write is in the error log instead. Never throws,
 * never delays the response.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminAudit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    const isAuthEvent = AUTH_EVENTS.has(path);
    if (
      !WRITES.has(req.method) ||
      !path.startsWith('/admin/') ||
      (path.startsWith('/admin/auth/') && !isAuthEvent)
    )
      return next.handle();
    return next.handle().pipe(
      tap((result) => {
        try {
          // a sign-in has no req.admin yet: the admin is in the response (Me)
          const me = isAuthEvent
            ? (result as { id?: string; email?: string } | null)
            : null;
          const body = (req.body ?? {}) as Record<string, unknown>;
          const data = {
            admin_id: req.admin?.id ?? me?.id ?? null,
            admin_email:
              req.admin?.email ??
              me?.email ??
              (typeof body.email === 'string' ? body.email : null),
            action: `${req.method} ${routeOf(req)}`,
            target: Object.keys(req.params ?? {}).length
              ? capData(req.params)
              : undefined,
            detail: capData(
              req.query && Object.keys(req.query).length
                ? { query: req.query, body }
                : body,
              ['code'],
            ),
            ip: req.ip ?? null,
          };
          void this.prisma.adminAuditLog
            .create({ data })
            .catch((e: Error) =>
              this.logger.warn(`audit not written: ${e.message}`),
            );
        } catch (e) {
          this.logger.warn(`audit not built: ${(e as Error).message}`);
        }
      }),
    );
  }
}
