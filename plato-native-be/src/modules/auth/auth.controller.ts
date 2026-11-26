import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';
import {
  changeEmailSchema,
  changePasswordSchema,
  forgotSchema,
  loginSchema,
  passwordConfirmSchema,
  resetSchema,
  signupSchema,
  tokenSchema,
  updateMeSchema,
} from './auth.schema';
import {
  ACCESS_TOKEN_COOKIE,
  AuthenticatedRequest,
  JwtAuthGuard,
} from './jwt-auth.guard';
import { IEnvParams } from '../../types/config/env.types';
import { JobSeekerService } from '../user/job-seeker.service';
import { JobSeekerPreferenceService } from '../user/job-seeker-preference.service';
import { RateLimiter } from '../extension/extension-token';

const ACCESS_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE = 60_000;

const parse = <T>(schema: ZodType<T>, body: unknown): T => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return parsed.data;
};

// Password guessing and mass sign-ups: per account (works behind any proxy)
// and, more loosely, per address. In memory, per process, like the extension's.
export const authLimiter = new RateLimiter();
function allow(key: string, limit: number, windowMs: number) {
  if (!authLimiter.hit(key, limit, windowMs))
    throw new HttpException(
      'Too many attempts. Wait a few minutes and try again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly jobSeekerService: JobSeekerService,
    private readonly preferenceService: JobSeekerPreferenceService,
    private readonly account: AccountService,
  ) {}

  private cookieDomain() {
    return process.env.COOKIE_DOMAIN || undefined;
  }

  private clearCookie(res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { domain: this.cookieDomain() });
  }

  private setAccessTokenCookie(res: Response, token: string) {
    const { nodeEnv } = this.configService.get<IEnvParams>('env')!;
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      // Secure in production, unless COOKIE_SECURE=false: a plain-http run on a bare IP (no TLS yet) would otherwise lose the cookie
      secure: process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : nodeEnv === 'production',
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
      // Parent domain (".platohiring.com") so the web app's route guard on jobs.* sees the cookie the api.* host set.
      domain: this.cookieDomain(),
    });
  }

  @Post('signup')
  async signup(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    allow(`signup-ip:${req.ip}`, 10, 10 * MINUTE);
    const { token, user } = await this.authService.signup(
      parse(signupSchema, body),
    );
    this.setAccessTokenCookie(res, token);
    // The confirmation email must not hold up, or fail, the sign-up.
    void this.account.sendVerification(user.id).catch(() => undefined);
    return user;
  }

  @Post('login')
  async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    allow(`login-ip:${req.ip}`, 30, MINUTE);
    const input = parse(loginSchema, body);
    // Strict per account and address, so guessing from one place stops; loose per account
    // from anywhere, so a stranger who knows the email can't lock its owner out.
    const strict = `login:${input.email}:${req.ip}`;
    allow(strict, 10, 15 * MINUTE);
    allow(`login:${input.email}`, 100, 15 * MINUTE);

    const { token, user } = await this.authService.login(input);
    authLimiter.reset(strict);
    this.setAccessTokenCookie(res, token);
    return user;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    this.clearCookie(res);
    return { success: true };
  }

  /** Settings → Security: every session, this one included, and every linked browser extension. */
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.account.signOutEverywhere(req.userId);
    this.clearCookie(res);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Sliding session: past half its 7 days, the app's next visit gets a fresh cookie.
    if (
      Date.now() - (req.tokenIssuedAt ?? 0) * 1000 >
      ACCESS_TOKEN_MAX_AGE_MS / 2
    )
      this.setAccessTokenCookie(
        res,
        await this.authService.issueToken(req.userId),
      );
    const [user, jobSeeker] = await Promise.all([
      this.authService.me(req.userId),
      this.jobSeekerService.getByUserId(req.userId),
    ]);
    const preferences = jobSeeker
      ? await this.preferenceService.get(jobSeeker.id)
      : null;
    return {
      ...user,
      onboarding_completed: preferences?.source === 'USER_CONFIRMED',
    };
  }

  /** Settings → Account: name and phone. */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.authService.updateMe(req.userId, parse(updateMeSchema, body));
  }

  /** Sends a link to the new address; the email changes when it is opened (POST /auth/verify-email). */
  @UseGuards(JwtAuthGuard)
  @Post('change-email')
  changeEmail(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    allow(`change-email:${req.userId}`, 5, 60 * MINUTE);
    const { email, password } = parse(changeEmailSchema, body);
    return this.account.requestEmailChange(req.userId, email, password);
  }

  /** Signs out every other session and linked browser; this one gets a fresh cookie. */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    allow(`change-password:${req.userId}`, 10, 15 * MINUTE);
    const { current, next } = parse(changePasswordSchema, body);
    await this.account.changePassword(req.userId, current, next);
    this.setAccessTokenCookie(
      res,
      await this.authService.issueToken(req.userId),
    );
    return { ok: true };
  }

  /** "Download my data": one JSON file. */
  @UseGuards(JwtAuthGuard)
  @Get('account/export')
  async exportAccount(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    allow(`export:${req.userId}`, 5, 60 * MINUTE);
    const data = await this.account.exportData(req.userId);
    // Each document's file, read through the API with this session.
    const api = `${req.protocol}://${req.get('host')}`;
    const docs = (data as Record<string, unknown>).jobSeekerDocument as
      { id: string }[] | undefined;
    docs?.forEach((d) =>
      Object.assign(d, {
        download: `${api}/job-seeker/documents/${d.id}/file`,
      }),
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="plato-data-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return data;
  }

  /** Deletes the account and everything in it, after the password. */
  @UseGuards(JwtAuthGuard)
  @Delete('account')
  async deleteAccount(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    allow(`delete:${req.userId}`, 5, 15 * MINUTE);
    const { password } = parse(passwordConfirmSchema, body);
    await this.account.deleteAccount(req.userId, password);
    this.clearCookie(res);
    return { ok: true };
  }

  /** Emails a reset link if the address has an account; the answer is the same, and as fast, either way. */
  @Post('forgot-password')
  forgotPassword(@Req() req: Request, @Body() body: unknown) {
    allow(`forgot-ip:${req.ip}`, 10, 15 * MINUTE);
    const { email } = parse(forgotSchema, body);
    // Strict per address and IP; loose per address, so a stranger can't use up its owner's links.
    allow(`forgot:${email}:${req.ip}`, 3, 60 * MINUTE);
    allow(`forgot:${email}`, 10, 60 * MINUTE);
    // Not awaited: the lookup and the email would make a known address answer slower.
    void this.account.forgotPassword(email).catch(() => undefined);
    return { ok: true };
  }

  /** Sets a new password from the emailed link and signs out every other session. */
  @Post('reset-password')
  async resetPassword(@Req() req: Request, @Body() body: unknown) {
    allow(`reset-ip:${req.ip}`, 20, 15 * MINUTE);
    const { token, password } = parse(resetSchema, body);
    return this.account.resetPassword(token, password);
  }

  @Post('verify-email')
  async verifyEmail(@Req() req: Request, @Body() body: unknown) {
    allow(`verify-ip:${req.ip}`, 20, 15 * MINUTE);
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid link');
    return this.account.verifyEmail(parsed.data.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  resendVerification(@Req() req: AuthenticatedRequest) {
    allow(`resend:${req.userId}`, 3, 60 * MINUTE);
    return this.account.sendVerification(req.userId);
  }
}
