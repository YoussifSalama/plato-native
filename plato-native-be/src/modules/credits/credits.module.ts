import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsAdminController } from './credits-admin.controller';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditsEstimatesService } from './estimates.service';
import { CreditsReportService } from './report.service';
import { TokensGuard } from './tokens.guard';

@Module({
  imports: [AuthModule],
  controllers: [CreditsController, CreditsAdminController],
  providers: [
    CreditsService,
    CreditsEstimatesService,
    CreditsReportService,
    TokensGuard,
  ],
  exports: [CreditsService, CreditsEstimatesService, TokensGuard],
})
export class CreditsModule {}
