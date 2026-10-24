import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeEngine } from './resume-engine.service';
import { ResumeProfileController } from './resume-profile.controller';
import { ResumeProfileService } from './resume-profile.service';

@Module({
  imports: [AuthModule],
  controllers: [ResumeProfileController],
  providers: [ResumeProfileService, ResumeEngine],
  exports: [ResumeProfileService, ResumeEngine],
})
export class ResumeModule {}
