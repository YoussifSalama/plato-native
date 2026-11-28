import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { IEnvParams } from '../../types/config/env.types';
import { RateLimiter } from '../extension/extension-token';
import {
  AdminAnyPage,
  AdminGuard,
  type AdminRequest,
  assertAdminOrigin,
} from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { genericAuthError, tooManyAttempts } from './admin-errors';
import {
  adminLoginLimiter,
  adminSignupLimiter,
  adminSuperResetLimiter,
  adminTotpLimiter,
} from './admin-limits';
import {
  loginSchema,
  parse,
  signupSchema,
  superResetSchema,
  totpCodeSchema,
} from './admin.schema';
import {
  ADMIN_PENDING_COOKIE,
  ADMIN_SESSION_COOKIE,
  AdminTokens,
  clearAdminCookie,
  setAdminCookie,
} from './admin-tokens';

const MINUTE = 60_000;

function allow(
  limiter: RateLimiter,
  key: string,
  limit: number,
  windowMs: number,
) {
  if (!limiter.hit(key, limit, windowMs)) throw tooManyAttempts();
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly tokens: AdminTokens,
    private readonly config: ConfigService,
  ) {}

  private origin(req: Request) {
    assertAdminOrigin(req, this.config.get<IEnvParams>('env')?.adminUrl ?? '');
  }

  @Post('signup')
  @HttpCode(200)
  async signup(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    allow(adminSignupLimiter, `ip:${req.ip}`, 10, 10 * MINUTE);
    const input = parse(signupSchema, body);
    allow(adminSignupLimiter, `email:${input.email}`, 10, 15 * MINUTE);
    const result = await this.auth.signup(input);
    if (result.next === 'totp_setup') {
      setAdminCookie(res, ADMIN_PENDING_COOKIE, result.pendingToken);
      return { next: result.next };
    }
    return result;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    allow(adminLoginLimiter, `ip:${req.ip}`, 30, MINUTE);
    const input = parse(loginSchema, body);
    // Strict per email and address; loose per email from anywhere, so a
    // stranger who knows the email can't lock its owner out.
    allow(
      adminLoginLimiter,
      `email-ip:${input.email}:${req.ip}`,
      10,
      15 * MINUTE,
    );
    allow(adminLoginLimiter, `email:${input.email}`, 50, 15 * MINUTE);
    const { next, pendingToken } = await this.auth.login(input);
    setAdminCookie(res, ADMIN_PENDING_COOKIE, pendingToken);
    return { next };
  }

  @Get('totp/setup')
  async totpSetup(@Req() req: Request) {
    allow(adminTotpLimiter, `ip:${req.ip}`, 30, 10 * MINUTE);
    const claims = await this.tokens.verifyPending(
      req.cookies?.[ADMIN_PENDING_COOKIE],
    );
    if (!claims) throw genericAuthError();
    return this.auth.totpSetup(claims);
  }

  @Post('totp/verify')
  @HttpCode(200)
  async totpVerify(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    allow(adminTotpLimiter, `ip:${req.ip}`, 30, 10 * MINUTE);
    const claims = await this.tokens.verifyPending(
      req.cookies?.[ADMIN_PENDING_COOKIE],
    );
    if (!claims) throw genericAuthError();
    allow(adminTotpLimiter, `admin:${claims.sub}`, 20, 10 * MINUTE);
    const { code } = parse(totpCodeSchema, body);
    const { sessionToken, me } = await this.auth.totpVerify(claims, code);
    clearAdminCookie(res, ADMIN_PENDING_COOKIE);
    setAdminCookie(res, ADMIN_SESSION_COOKIE, sessionToken);
    return me;
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    clearAdminCookie(res, ADMIN_SESSION_COOKIE);
    clearAdminCookie(res, ADMIN_PENDING_COOKIE);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  @AdminAnyPage()
  me(@Req() req: AdminRequest) {
    return this.auth.me(req.admin.id);
  }

  @Post('super-reset')
  @HttpCode(200)
  superReset(@Req() req: Request, @Body() body: unknown) {
    this.origin(req);
    allow(adminSuperResetLimiter, `ip:${req.ip}`, 5, 60 * MINUTE);
    const input = parse(superResetSchema, body);
    allow(adminSuperResetLimiter, `email:${input.email}`, 5, 60 * MINUTE);
    return this.auth.superReset(input);
  }
}
