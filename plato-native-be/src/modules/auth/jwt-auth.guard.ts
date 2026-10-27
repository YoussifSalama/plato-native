import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export const ACCESS_TOKEN_COOKIE = 'access_token';

// A password reset signs out every session issued before it. The cut-off is
// read from the user row and cached briefly, so most requests cost no query;
// the instance that handled the reset forgets its copy at once.
// ponytail: other API instances notice within SESSION_CACHE_MS.
const SESSION_CACHE_MS = 60_000;
const cutoffs = new Map<string, { after: number; until: number }>();

export function forgetSessions(userId: string) {
  cutoffs.delete(userId);
}

async function sessionsValidAfter(userId: string): Promise<number> {
  const hit = cutoffs.get(userId);
  if (hit && hit.until > Date.now()) return hit.after;
  const prisma = PrismaService.instance;
  if (!prisma) return 0;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessions_valid_after: true },
  });
  const after = user?.sessions_valid_after?.getTime() ?? 0;
  if (cutoffs.size > 50_000) cutoffs.clear();
  cutoffs.set(userId, { after, until: Date.now() + SESSION_CACHE_MS });
  return after;
}

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[ACCESS_TOKEN_COOKIE];
    if (!token) throw new UnauthorizedException('Not authenticated');

    let payload: { sub: string; iat?: number };
    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
        iat?: number;
      }>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
    const after = await sessionsValidAfter(payload.sub);
    if (after && (payload.iat ?? 0) * 1000 < after)
      throw new UnauthorizedException('Invalid or expired session');
    request.userId = payload.sub;
    return true;
  }
}
