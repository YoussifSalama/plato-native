import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ExtensionPrincipal, ExtensionService } from './extension.service';
import { ExtensionScope, RateLimiter } from './extension-token';

export interface ExtensionRequest extends Request {
  extension: ExtensionPrincipal;
}

const SCOPES_KEY = 'extension:scopes';
/** Every token route MUST declare its scopes; `@ExtensionScopes()` = none needed. */
export const ExtensionScopes = (...scopes: ExtensionScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);

/** The one route group that is not behind a guard: the pairing code is the credential. */
export const EXTENSION_PUBLIC_KEY = 'extension:public';
export const ExtensionPublic = () => SetMetadata(EXTENSION_PUBLIC_KEY, true);

/** The one origin allowed to use extension routes. Unset = everything denied. */
export const extensionOrigin = () => process.env.EXTENSION_ORIGIN || null;

export const TOKEN_LIMIT = { limit: 120, windowMs: 60_000 };
export const limiter = new RateLimiter();

@Injectable()
export class ExtensionAuthGuard implements CanActivate {
  constructor(
    private readonly extension: ExtensionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ExtensionRequest>();

    // Fail closed: no declared scopes, no access.
    const scopes = this.reflector.get<ExtensionScope[] | undefined>(
      SCOPES_KEY,
      context.getHandler(),
    );
    if (!scopes) throw new ForbiddenException('Route has no declared scope');

    // Defense in depth (CORS is browser-side only; the token is the credential).
    const allowed = extensionOrigin();
    if (!allowed || req.headers.origin !== allowed)
      throw new ForbiddenException('Origin not allowed');

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new UnauthorizedException('Not authenticated');
    const principal = await this.extension.authenticate(header.slice(7));
    if (!principal) throw new UnauthorizedException('Invalid or expired token');

    if (
      !limiter.hit(
        `tok:${principal.deviceId}`,
        TOKEN_LIMIT.limit,
        TOKEN_LIMIT.windowMs,
      )
    )
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    if (!scopes.every((s) => principal.scopes.includes(s)))
      throw new ForbiddenException('Missing scope');

    req.extension = principal;
    return true;
  }
}
