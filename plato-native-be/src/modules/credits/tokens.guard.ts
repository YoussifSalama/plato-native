import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { CreditsService } from './credits.service';

// On a route that spends Plato tokens, after JwtAuthGuard: a seeker with no
// tokens left gets 402 insufficient_tokens before any model or board is called.
// A module that uses it imports CreditsModule.
@Injectable()
export class TokensGuard implements CanActivate {
  constructor(private readonly credits: CreditsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.credits.require(req.userId);
    return true;
  }
}
