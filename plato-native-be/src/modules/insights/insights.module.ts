import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { UserModule } from '../user/user.module';
import { AlertMatcherService } from './alert-matcher.service';
import { InsightsBackfillService } from './backfill.service';
import { DigestService } from './digest.service';
import {
  InsightsController,
  InsightsPublicController,
} from './insights.controller';
import { InsightsService } from './insights.service';

// Job alerts (see INSIGHTS.md). Mail and notifications come from global modules.
@Module({
  imports: [AuthModule, UserModule, CreditsModule, DiscoveryModule],
  controllers: [InsightsController, InsightsPublicController],
  providers: [
    InsightsService,
    AlertMatcherService,
    DigestService,
    InsightsBackfillService,
  ],
})
export class InsightsModule {}
