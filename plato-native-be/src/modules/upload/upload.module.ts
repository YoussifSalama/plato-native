import { Module } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { UploadController } from './upload.controller';
import { UPLOAD_DIR, UploadService } from './upload.service';

mkdirSync(UPLOAD_DIR, { recursive: true });

@Module({
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
