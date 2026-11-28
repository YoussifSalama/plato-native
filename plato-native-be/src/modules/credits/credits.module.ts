import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { CreditsAdminController } from './credits-admin.controller';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditsEstimatesService } from './estimates.service';
import { PlansAdminController } from './plans-admin.controller';
import { PlansService } from './plans.service';
import { CreditsReportService } from './report.service';
import { TokensGuard } from './tokens.guard';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [CreditsController, CreditsAdminController, PlansAdminController],
  providers: [
    CreditsService,
    CreditsEstimatesService,
    CreditsReportService,
    PlansService,
    TokensGuard,
  ],
  exports: [CreditsService, CreditsEstimatesService, TokensGuard],
})
export class CreditsModule {}
