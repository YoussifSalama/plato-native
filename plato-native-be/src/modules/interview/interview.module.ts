import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeModule } from '../resume/resume.module';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';

@Module({
  imports: [AuthModule, ResumeModule],
  controllers: [InterviewController],
  providers: [InterviewService],
})
export class InterviewModule {}
