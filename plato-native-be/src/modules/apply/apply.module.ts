import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { UserModule } from '../user/user.module';
import { ResumeModule } from '../resume/resume.module';
import { LeverApplyAdapter } from './adapters/lever.adapter';
import { WorkableApplyAdapter } from './adapters/workable.adapter';
import { GreenhouseApplyAdapter } from './adapters/greenhouse.adapter';
import { AshbyApplyAdapter } from './adapters/ashby.adapter';
import { ApplyEventsBus } from './apply-events.bus';
import { ApplyController } from './apply.controller';
import { ApplyService } from './apply.service';
import { AdapterHelper } from './adapters/helpers/adapters.helper';

@Module({
  imports: [UserModule, AuthModule, DocumentsModule, ResumeModule],
  controllers: [ApplyController],
  exports: [ApplyService],
  providers: [
    ApplyService,
    ApplyEventsBus,
    LeverApplyAdapter,
    WorkableApplyAdapter,
    GreenhouseApplyAdapter,
    AshbyApplyAdapter,
    AdapterHelper,
  ],
})
export class ApplyModule {}
