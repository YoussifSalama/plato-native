import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { loginSchema, signupSchema } from './auth.schema';
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
  ) {}

  private setAccessTokenCookie(res: Response, token: string) {
    const { nodeEnv } = this.configService.get<IEnvParams>('env')!;
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: nodeEnv === 'production',
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    });
  }

  @Post('signup')
  async signup(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    allow(`signup-ip:${req.ip}`, 10, 10 * MINUTE);
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const { token, user } = await this.authService.signup(parsed.data);
    this.setAccessTokenCookie(res, token);
    return user;
  }

  @Post('login')
  async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    allow(`login-ip:${req.ip}`, 30, MINUTE);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    allow(`login:${parsed.data.email.trim().toLowerCase()}`, 10, 15 * MINUTE);

    const { token, user } = await this.authService.login(parsed.data);
    this.setAccessTokenCookie(res, token);
    return user;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
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
}
