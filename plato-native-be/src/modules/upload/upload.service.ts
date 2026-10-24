import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { basename, join } from 'path';

export const UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  'job-seeker-documents',
);

@Injectable()
export class UploadService {
  toResponse(file: Express.Multer.File) {
    return {
      name: file.originalname,
      url: `/uploads/job-seeker-documents/${file.filename}`,
    };
  }

  remove(filename: string) {
    const path = join(UPLOAD_DIR, basename(filename));
    if (!existsSync(path)) throw new NotFoundException('File not found');
    unlinkSync(path);
  }
}
