import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { blockedError, sessionState } from './session-state';

export const ACCESS_TOKEN_COOKIE = 'access_token';

export { blockedError, forgetSessions } from './session-state';

export interface AuthenticatedRequest extends Request {
  userId: string;
  // The session's issue time (seconds), for the sliding refresh in /auth/me.
  tokenIssuedAt?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[ACCESS_TOKEN_COOKIE];
    if (!token) throw new UnauthorizedException('Not authenticated');

    let payload: { sub: string; iat?: number; aud?: unknown };
    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
        iat?: number;
        aud?: unknown;
      }>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
    // Seeker sessions carry no audience. Admin tokens (aud plato-admin*) are
    // signed with other keys and never verify here; this refuses them anyway.
    if (payload.aud !== undefined || typeof payload.sub !== 'string')
      throw new UnauthorizedException('Invalid or expired session');
    const state = await sessionState(payload.sub);
    if (
      state === null ||
      (state.after && (payload.iat ?? 0) * 1000 < state.after)
    )
      throw new UnauthorizedException('Invalid or expired session');
    if (state.blocked) throw blockedError();
    request.userId = payload.sub;
    request.tokenIssuedAt = payload.iat;
    return true;
  }
}
