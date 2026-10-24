import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { UserModule } from '../user/user.module';
import { ExtensionAuthGuard } from './extension-auth.guard';
import {
  ExtensionApiController,
  ExtensionPairingController,
  ExtensionWebController,
} from './extension.controllers';
import { ExtensionBatchService } from './batch.service';
import { CandidateService } from './candidate.service';
import { AnswersService } from './answers.service';
import { ExtensionService } from './extension.service';
import { QueueService } from './queue.service';
import { ExtensionSettingsService } from './settings';
import { OrchestratorService } from './orchestrator.service';
import { DOC_STORAGE, RESUME_ENGINE, ResumeFileService } from './resume-file.service';
import { StorageService } from '../documents/storage.service';
import { ResumeModule } from '../resume/resume.module';
import { DocumentsModule } from '../documents/documents.module';
import { ResumeEngine } from '../resume/resume-engine.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { DISCOVERY_MATCHES, SearchesService } from './searches.service';
import { V3Controller } from './v3/v3.controller';
import { V3SessionService } from './v3/v3-session.service';

@Module({
  imports: [AuthModule, UserModule, DiscoveryModule, ResumeModule, DocumentsModule],
  controllers: [
    V3Controller,
    ExtensionWebController,
    ExtensionPairingController,
    ExtensionApiController,
  ],
  providers: [
    ExtensionService,
    ExtensionAuthGuard,
    ExtensionBatchService,
    CandidateService,
    SearchesService,
    { provide: DISCOVERY_MATCHES, useExisting: DiscoveryService },
    OrchestratorService,
    AnswersService,
    ResumeFileService,
    { provide: RESUME_ENGINE, useExisting: ResumeEngine },
    { provide: DOC_STORAGE, useExisting: StorageService },
    QueueService,
    ExtensionSettingsService,
    V3SessionService,
  ],
})
export class ExtensionModule {}
