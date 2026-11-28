import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { ActivityController } from './activity.controller';
import { AdminUsageController } from './admin-usage.controller';
import { UsageRollupService } from './usage-rollup.service';
import { ErrorsController, UsageController } from './usage.controller';

@Module({
  imports: [AdminModule, AuthModule],
  controllers: [
    UsageController,
    ErrorsController,
    AdminUsageController,
    ActivityController,
  ],
  providers: [UsageRollupService],
  exports: [UsageRollupService],
})
export class UsageModule {}
