import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';
import { AdminOverviewController } from './admin-overview.controller';
import {
  AdminRateLimitsController,
  AdminUsersController,
} from './admin-users.controller';
import { AdminInsightsService } from './admin-insights.service';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AdminModule, AuthModule, CreditsModule],
  controllers: [
    AdminUsersController,
    AdminRateLimitsController,
    AdminOverviewController,
  ],
  providers: [AdminUsersService, AdminInsightsService],
})
export class AdminUsersModule {}
