import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JobSeekerDocumentType } from '@prisma/client';
import { extname } from 'path';
import { z } from 'zod';
import { JwtAuthGuard, AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JobSeekerService } from '../user/job-seeker.service';
import { JobSeekerDocumentService } from '../user/job-seeker-document.service';
import { JobSeekerDocumentVersionService } from '../user/job-seeker-document-version.service';
import { StorageService } from './storage.service';
import { TextExtractionService } from './text-extraction.service';

const ALLOWED_EXT = new Set(['.pdf', '.docx']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_SIZE = 10 * 1024 * 1024;
const MAX_REPLACEMENTS_PER_VERSION = 3;

const uploadTypeSchema = z.enum(
  Object.values(JobSeekerDocumentType) as [string, ...string[]],
);

@Controller('job-seeker/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly jobSeekerService: JobSeekerService,
    private readonly documentService: JobSeekerDocumentService,
    private readonly versionService: JobSeekerDocumentVersionService,
    private readonly storageService: StorageService,
    private readonly textExtractionService: TextExtractionService,
  ) {}

  private async requireJobSeekerId(userId: string) {
    const jobSeeker = await this.jobSeekerService.getByUserId(userId);
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    return jobSeeker.id;
  }

  // The caller's own document, or 404: someone else's id reads as not found.
  private async ownDocument(userId: string, id: string) {
    const jobSeekerId = await this.requireJobSeekerId(userId);
    const document = await this.documentService.findById(id);
    if (!document || document.job_seeker_id !== jobSeekerId)
      throw new NotFoundException('Document not found');
    return document;
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async upload(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') rawType: unknown,
  ) {
    if (!file) throw new BadRequestException('No file provided');

    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Only PDF or DOCX files are accepted');
    }

    const parsedType = uploadTypeSchema.safeParse(rawType);
    if (!parsedType.success)
      throw new BadRequestException('Invalid document type');
    const type = parsedType.data as JobSeekerDocumentType;

    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const version = await this.versionService.getOrCreateCurrent(jobSeekerId);

    const storageKey = await this.storageService.upload(
      file,
      `job-seeker-documents/${jobSeekerId}`,
    );

    let document;
    try {
      document = await this.documentService.add(jobSeekerId, {
        type,
        url: storageKey,
        name: file.originalname,
        storage_key: storageKey,
        document_version_id: version.id,
      });
    } catch (error) {
      await this.storageService.delete(storageKey);
      throw error;
    }

    try {
      await this.documentService.update(document.id, { status: 'PROCESSING' });
      const text = await this.textExtractionService.extract(
        file.buffer,
        file.mimetype,
      );
      document = await this.documentService.update(document.id, {
        status: 'READY',
        extracted_text: text,
      });
    } catch (error) {
      document = await this.documentService.update(document.id, {
        status: 'FAILED',
        processing_error:
          error instanceof Error ? error.message : 'Extraction failed',
      });
    }

    return document;
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const version = await this.versionService.getCurrent(jobSeekerId);
    if (!version) return [];
    return this.documentService.listByVersion(version.id);
  }

  @Put(':id/replace')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async replace(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');

    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Only PDF or DOCX files are accepted');
    }

    const document = await this.ownDocument(req.userId, id);

    const version = await this.versionService.findById(
      document.document_version_id,
    );
    if (!version || version.replacement_count >= MAX_REPLACEMENTS_PER_VERSION) {
      throw new ConflictException(
        `You've reached the limit of ${MAX_REPLACEMENTS_PER_VERSION} document replacements`,
      );
    }

    const oldStorageKey = document.storage_key;
    const storageKey = await this.storageService.upload(
      file,
      `job-seeker-documents/${document.job_seeker_id}`,
    );

    let updated = await this.documentService.update(id, {
      status: 'PROCESSING',
      storage_key: storageKey,
      url: storageKey,
      name: file.originalname,
    });
    await this.storageService.delete(oldStorageKey);

    try {
      const text = await this.textExtractionService.extract(
        file.buffer,
        file.mimetype,
      );
      updated = await this.documentService.update(id, {
        status: 'READY',
        extracted_text: text,
      });
    } catch (error) {
      updated = await this.documentService.update(id, {
        status: 'FAILED',
        processing_error:
          error instanceof Error ? error.message : 'Extraction failed',
      });
    }

    const newCount = await this.versionService.incrementReplacementCount(
      version.id,
    );
    return {
      ...updated,
      remaining_replacements: MAX_REPLACEMENTS_PER_VERSION - newCount,
    };
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const document = await this.ownDocument(req.userId, id);
    await this.storageService.delete(document.storage_key);
    await this.documentService.remove(id);
    return { removed: id };
  }
}
