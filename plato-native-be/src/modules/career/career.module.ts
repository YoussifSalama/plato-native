import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeModule } from '../resume/resume.module';
import { DocumentsModule } from '../documents/documents.module';
import { UserModule } from '../user/user.module';
import { CareerController } from './career.controller';
import { CareerService } from './career.service';
import { CareerResumesService } from './career-resumes.service';
import { CareerVoiceService } from './career-voice.service';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [AuthModule, ResumeModule, DocumentsModule, UserModule, CreditsModule],
  controllers: [CareerController],
  providers: [CareerService, CareerResumesService, CareerVoiceService],
})
export class CareerModule {}
