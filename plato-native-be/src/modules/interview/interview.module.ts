import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeModule } from '../resume/resume.module';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [AuthModule, ResumeModule, CreditsModule],
  controllers: [InterviewController],
  providers: [InterviewService],
})
export class InterviewModule {}
