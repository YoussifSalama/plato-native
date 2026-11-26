import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { extname } from 'path';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { authLimiter } from '../auth/auth.controller';
import { JobSeekerService } from '../user/job-seeker.service';
import { COUNTRY_CODES } from '../discovery/countries';
import { GUEST_OPEN, GUEST_TTL_MS, GuestService } from './guest.service';

// The device's guest: an httpOnly cookie holding a random token (the database keeps only its hash).
export const GUEST_COOKIE = 'plato_guest';
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production',
  // Same parent domain as the session cookie, so the web app and the API share it.
  domain: process.env.COOKIE_DOMAIN || undefined,
});

const ALLOWED_EXT = new Set(['.pdf', '.docx']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_SIZE = 10 * 1024 * 1024;
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const searchSchema = z.object({
  roles: z.array(z.string().trim().min(2).max(80)).min(1).max(2),
  countries: z.array(z.enum(COUNTRY_CODES)).max(2).default([]),
  remoteTypes: z
    .array(z.enum(['onsite', 'hybrid', 'remote']))
    .max(3)
    .default([]),
  level: z.enum(['entry', 'mid', 'senior']).nullable().default(null),
});
const pickSchema = z.object({
  jobIds: z.array(objectId).max(GUEST_OPEN),
});

const tokenOf = (req: Request) =>
  (req.cookies as Record<string, string | undefined> | undefined)?.[
    GUEST_COOKIE
  ];

// The public /search page: no account. CV, then the search, then two open jobs.
@Controller('public/guest')
export class GuestController {
  constructor(private readonly guests: GuestService) {}

  private async require(req: Request) {
    const guest = await this.guests.find(tokenOf(req));
    if (!guest) throw new NotFoundException('Start by uploading your CV');
    return guest;
  }

  @Get()
  async view(@Req() req: Request) {
    const guest = await this.guests.find(tokenOf(req));
    return guest ? this.guests.view(guest) : null;
  }

  @Post('cv')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async uploadCv(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    // Bursts from one address, before any AI runs (the daily limits are counted in the database).
    if (!authLimiter.hit(`guest-cv-ip:${req.ip}`, 6, 10 * 60_000))
      throw new HttpException(
        'Too many uploads. Wait a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (!file) throw new BadRequestException('No file provided');
    if (
      !ALLOWED_EXT.has(extname(file.originalname).toLowerCase()) ||
      !ALLOWED_MIME.has(file.mimetype)
    )
      throw new BadRequestException('Only PDF or DOCX files are accepted');
    const { token, view } = await this.guests.uploadCv(
      tokenOf(req),
      file,
      req.ip,
      req.get('user-agent'),
    );
    if (token)
      res.cookie(GUEST_COOKIE, token, {
        ...cookieOptions(),
        maxAge: GUEST_TTL_MS,
      });
    return view;
  }

  @Post('search')
  @HttpCode(200)
  async search(@Req() req: Request, @Body() body: unknown) {
    const parsed = searchSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.guests.startSearch(await this.require(req), parsed.data);
  }

  @Get('search/:id')
  async getSearch(@Req() req: Request, @Param('id') id: string) {
    const guest = await this.require(req);
    // Only this device's own searches.
    const row = objectId.safeParse(id).success
      ? await this.guests.searchOf(guest.id, id)
      : null;
    if (!row) throw new NotFoundException('Search not found');
    return this.guests.searchView(row);
  }

  @Post('picks')
  @HttpCode(200)
  async pick(@Req() req: Request, @Body() body: unknown) {
    const parsed = pickSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.guests.pick(await this.require(req), parsed.data.jobIds);
  }
}

// Right after signup or login on the same device: the guest moves onto the account.
@Controller('job-seeker/guest')
@UseGuards(JwtAuthGuard)
export class GuestClaimController {
  constructor(
    private readonly guests: GuestService,
    private readonly jobSeekers: JobSeekerService,
  ) {}

  @Post('claim')
  @HttpCode(200)
  async claim(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const seeker = await this.jobSeekers.getByUserId(req.userId);
    if (!seeker) throw new NotFoundException('Job seeker profile not found');
    const out = await this.guests.claim(tokenOf(req), seeker.id);
    res.clearCookie(GUEST_COOKIE, cookieOptions());
    return out;
  }
}
