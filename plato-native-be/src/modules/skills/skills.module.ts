import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeModule } from '../resume/resume.module';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  imports: [AuthModule, ResumeModule],
  controllers: [SkillsController],
  providers: [SkillsService],
})
export class SkillsModule {}
