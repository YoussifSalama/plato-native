import {
  ArgumentsHost,
  CanActivate,
  Catch,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import type { NextFunction, Request, Response } from 'express';
import { userOfSeeker } from '../auth/session-state';
import { PrismaService } from '../prisma/prisma.service';
import {
  capData,
  codeOf,
  explain,
  messageOf,
  moduleKey,
  platformOf,
} from './error-log';

// What the filter and the stamp leave on the request for the log line.
type Stamped = Request & {
  userId?: string;
  extension?: { jobSeekerId?: string };
  plato?: { controller?: Function; error?: unknown };
};

const PAGE_HEADER = 'x-plato-page';
const CODE_IS_SECRET = /\/(pairing|auth)(\/|$)/;
// ponytail: a flood guard per process (a crash loop must not fill Mongo); raise it if real errors get dropped.
const MAX_PER_MINUTE = 600;

/**
 * Global stamp: remembers which controller handles the request, so a failure
 * (even a guard's 401) is logged under its module. Allows everything.
 */
@Injectable()
export class ErrorLogStamp implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Stamped>();
    if (req) req.plato = { ...req.plato, controller: context.getClass() };
    return true;
  }
}

/**
 * The app's exception filter: Sentry's, unchanged (same responses, same reports),
 * after noting the exception on the request for the error log.
 */
@Catch()
export class ErrorLogFilter extends SentryGlobalFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    try {
      if (host.getType() === 'http') {
        const req = host.switchToHttp().getRequest<Stamped>();
        req.plato = { ...req.plato, error: exception };
      }
    } catch {
      // the log must never change how an error is answered
    }
    return super.catch(exception, host);
  }
}

/** Writes ErrorLog rows. Never throws, never holds up a response. */
@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger('ErrorLog');
  private modules?: Map<Function, string>;
  private window = { start: 0, n: 0, dropped: 0 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly container: ModulesContainer,
  ) {}

  private moduleOf(controller?: Function) {
    if (!controller) return 'none';
    if (!this.modules) {
      this.modules = new Map();
      for (const m of this.container.values())
        for (const c of m.controllers.keys())
          this.modules.set(c as Function, moduleKey(m.metatype?.name ?? ''));
    }
    return this.modules.get(controller) ?? moduleKey(controller.name.replace(/Controller$/, ''));
  }

  private allow(now = Date.now()) {
    if (now - this.window.start > 60_000) {
      if (this.window.dropped)
        this.logger.warn(`${this.window.dropped} error logs dropped (over ${MAX_PER_MINUTE}/min)`);
      this.window = { start: now, n: 0, dropped: 0 };
    }
    if (++this.window.n > MAX_PER_MINUTE) {
      this.window.dropped++;
      return false;
    }
    return true;
  }

  /** Express middleware, first in the chain: every finished response >= 400 is logged. */
  readonly middleware = (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) setImmediate(() => this.fromResponse(req as Stamped, res.statusCode));
    });
    next();
  };

  /** One failed request. Fire-and-forget. */
  fromResponse(req: Stamped, status: number) {
    try {
      if (!this.allow()) return;
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
      const page = String(req.headers?.[PAGE_HEADER] ?? '').slice(0, 300) || undefined;
      const error = req.plato?.error;
      const body = req.body as Record<string, unknown> | undefined;
      const row = {
        platform: platformOf(path, page),
        source: 'server',
        module: this.moduleOf(req.plato?.controller),
        page,
        method: req.method ?? '',
        path: path.slice(0, 500),
        status,
        code: codeOf(error),
        message: messageOf(error) || `HTTP ${status}`,
        explanation: explain(status, error, { routed: !!req.plato?.controller }),
        // a code is the credential on pairing, TOTP and email/password-reset routes
        data: capData({ query: req.query, body }, CODE_IS_SECRET.test(path) ? ['code'] : []),
        ip: req.ip,
        user_agent: String(req.headers?.['user-agent'] ?? '').slice(0, 300) || undefined,
      };
      const email = typeof body?.email === 'string' ? body.email.slice(0, 200) : undefined;
      void this.withUser(req.userId, req.extension?.jobSeekerId, email)
        .catch(() => ({}))
        .then((u) => this.prisma.errorLog.create({ data: { ...row, ...u } }))
        .catch((e: Error) => this.logger.warn(`error log not written: ${e.message}`));
    } catch (e) {
      this.logger.warn(`error log not built: ${(e as Error).message}`);
    }
  }

  /** An error the extension reported itself (POST /extension/v1/errors). */
  client(
    req: Request,
    jobSeekerId: string,
    r: { message: string; code?: string; page?: string; stack?: string; data?: unknown },
  ) {
    try {
      if (!this.allow()) return;
      const row = {
        platform: 'extension',
        source: 'client',
        module: 'extension',
        page: r.page,
        method: req.method,
        path: (req.originalUrl ?? req.url ?? '').split('?')[0],
        status: 0,
        code: r.code,
        message: r.message.slice(0, 1000),
        explanation: 'Reported by the extension itself (an error in the browser, not an API response).',
        data: capData({ stack: r.stack, data: r.data }),
        ip: req.ip,
        user_agent: String(req.headers['user-agent'] ?? '').slice(0, 300) || undefined,
      };
      void this.withUser(undefined, jobSeekerId)
        .catch(() => ({}))
        .then((u) => this.prisma.errorLog.create({ data: { ...row, ...u } }))
        .catch((e: Error) => this.logger.warn(`client error log not written: ${e.message}`));
    } catch (e) {
      this.logger.warn(`client error log not built: ${(e as Error).message}`);
    }
  }

  private async withUser(userId?: string, jobSeekerId?: string, email?: string) {
    const id = userId ?? (jobSeekerId ? await userOfSeeker(jobSeekerId) : null);
    if (!id) return email ? { user_email: email } : {};
    const u = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    return { user_id: id, user_email: u?.email ?? email };
  }
}
