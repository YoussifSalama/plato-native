import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { requireTokens } from './credits';

// On a route that spends Plato tokens, after JwtAuthGuard: a seeker with no
// tokens left gets 402 insufficient_tokens before any model or board is called.
@Injectable()
export class TokensGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await requireTokens(req.userId);
    return true;
  }
}
