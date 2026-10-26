import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { ApplyModule } from '../apply/apply.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { ApifyService } from './apify.service';
import { AtsAggregatorAdapter } from './adapters/ats-aggregator.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { BoardsAdapter } from './adapters/boards.adapter';
import { OpenFeedsAdapter } from './adapters/open-feeds.adapter';
import { JobFreshnessService } from './job-freshness.service';
import { MatchingService } from './matching.service';
import { RunProgressBus } from './run-progress.bus';
import { LocalIndexAdapter } from './adapters/local-index.adapter';
import { PublicBoardsAdapter } from './adapters/public-boards.adapter';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [UserModule, AuthModule, ApplyModule, CreditsModule],
  controllers: [DiscoveryController],
  providers: [
    DiscoveryService,
    ApifyService,
    AtsAggregatorAdapter,
    LinkedInAdapter,
    BoardsAdapter,
    OpenFeedsAdapter,
    JobFreshnessService,
    MatchingService,
    RunProgressBus,
    LocalIndexAdapter,
    PublicBoardsAdapter,
  ],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
