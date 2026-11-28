import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AdminUsageController } from './admin-usage.controller';
import { ErrorsController, UsageController } from './usage.controller';

@Module({
  imports: [AdminModule],
  controllers: [UsageController, ErrorsController, AdminUsageController],
})
export class UsageModule {}
