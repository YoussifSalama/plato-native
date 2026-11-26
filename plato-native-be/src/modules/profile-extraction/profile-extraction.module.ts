import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { ProfileExtractionController } from './profile-extraction.controller';
import { ProfileExtractionAgentService } from './profile-extraction-agent.service';
import { ProfileEvaluationService } from './profile-evaluation.service';
import { CvAnalysisService } from './cv-analysis.service';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [UserModule, AuthModule, CreditsModule],
  controllers: [ProfileExtractionController],
  providers: [
    ProfileExtractionAgentService,
    ProfileEvaluationService,
    CvAnalysisService,
  ],
  exports: [CvAnalysisService],
})
export class ProfileExtractionModule {}
