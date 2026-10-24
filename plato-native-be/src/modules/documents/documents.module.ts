import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsController } from './documents.controller';
import { StorageService } from './storage.service';
import { TextExtractionService } from './text-extraction.service';

@Module({
  imports: [UserModule, AuthModule],
  controllers: [DocumentsController],
  providers: [StorageService, TextExtractionService],
  exports: [StorageService, TextExtractionService],
})
export class DocumentsModule {}
