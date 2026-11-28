import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, AdminPage } from '../admin/admin-auth.guard';
import { listRateLimits, rateLimiters } from '../extension/extension-token';
import { pageOf, parseRange } from '../usage/usage-stats';
import { AdminUsersService } from './admin-users.service';

const STATUSES = new Set(['all', 'verified', 'unverified', 'blocked']);

// Admin panel, Users page: seekers, their analytics and the support actions.
@Controller('admin/users')
@UseGuards(AdminGuard)
@AdminPage('users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('status') status = 'all',
    @Query('page') page?: string,
    @Query('sort') sort?: string,
  ) {
    return this.users.list(
      q,
      STATUSES.has(status) ? status : 'all',
      pageOf(page),
      sort ?? '',
    );
  }

  @Get(':id/analytics')
  analytics(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.users.analytics(id, parseRange(from, to));
  }

  @Get(':id/engagement')
  engagement(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.users.engagement(id, parseRange(from, to));
  }

  @Post(':id/block')
  @HttpCode(200)
  block(@Param('id') id: string, @Body() body: unknown) {
    return this.users.block(id, AdminUsersService.reasonOf(body));
  }

  @Post(':id/unblock')
  @HttpCode(200)
  unblock(@Param('id') id: string) {
    return this.users.unblock(id);
  }

  @Post(':id/verify-email')
  @HttpCode(200)
  verifyEmail(@Param('id') id: string) {
    return this.users.verifyEmail(id);
  }

  @Post(':id/logout-all')
  @HttpCode(200)
  logoutAll(@Param('id') id: string) {
    return this.users.logoutAll(id);
  }

  @Post(':id/clear-rate-limits')
  @HttpCode(200)
  clearRateLimits(@Param('id') id: string) {
    return this.users.clearRateLimits(id);
  }
}

// The in-memory rate limits (IP / user / email keys): the super admin's, like the admin section.
// Seeker support keeps "Clear rate limits" on a user's page (page "users"), which never lifts the
// admin panel's own sign-in limits.
@Controller('admin/rate-limits')
@UseGuards(AdminGuard)
@AdminPage('admin')
export class AdminRateLimitsController {
  @Get()
  list(@Query('q') q?: string) {
    return listRateLimits(q);
  }

  @Delete()
  clear(@Query('limiter') limiter?: string, @Query('key') key?: string) {
    const l = limiter ? rateLimiters.get(limiter) : undefined;
    if (!l || !key)
      throw new BadRequestException('limiter and key are required');
    l.reset(key);
    return { ok: true };
  }
}
