import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, AdminPage } from '../admin/admin-auth.guard';
import { parseRange } from '../usage/usage-stats';
import { PlansService } from './plans.service';

// Admin panel, Plans page: the plans and top-up packs on offer, and the real
// usage the price calculator works from.
@Controller('admin/plans')
@UseGuards(AdminGuard)
@AdminPage('plans')
export class PlansAdminController {
  constructor(private readonly plans: PlansService) {}

  // the Credits page lists plans and packs for its pickers
  @Get()
  @AdminPage('plans', 'credits')
  list() {
    return this.plans.list();
  }

  // before :key, so "calculator" is not read as a plan key
  @Get('calculator')
  calculator(@Query('from') from?: string, @Query('to') to?: string) {
    return this.plans.calculator(parseRange(from, to));
  }

  @Post()
  create(@Body() body: unknown) {
    return this.plans.create(body);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() body: unknown) {
    return this.plans.update(key, body);
  }

  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.plans.remove(key);
  }
}
