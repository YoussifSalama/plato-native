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
  Res,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JobSeekerDocument, JobSeekerDocumentType } from '@prisma/client';
import { extname } from 'path';
import { z } from 'zod';
import { JwtAuthGuard, AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JobSeekerService } from '../user/job-seeker.service';
import { JobSeekerDocumentService } from '../user/job-seeker-document.service';
import { JobSeekerDocumentVersionService } from '../user/job-seeker-document-version.service';
import { StorageService } from './storage.service';
import { TextExtractionService } from './text-extraction.service';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_OF: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': DOCX,
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);
// Often a photo or a scan: a JPG or PNG is kept as it is (no text to read).
const IMAGE_TYPES = new Set<JobSeekerDocumentType>([
  'ID_DOCUMENT',
  'WORK_PERMIT',
  'LICENSE',
  'PORTFOLIO',
]);
const MAX_SIZE = 10 * 1024 * 1024;
const MAX_REPLACEMENTS_PER_VERSION = 3;
const OBJECT_ID = /^[a-f\d]{24}$/i;

const uploadTypeSchema = z.enum(
  Object.values(JobSeekerDocumentType) as [string, ...string[]],
);

// Multer reads the file name as latin1, which garbles Arabic and any other
// non-Latin name; the browser sent UTF-8. Then the type check, by extension
// and MIME together. Returns whether the file is an image.
export function checkFile(
  file: Express.Multer.File | undefined,
  type: JobSeekerDocumentType,
): boolean {
  if (!file) throw new BadRequestException('No file provided');
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const ext = extname(file.originalname).toLowerCase();
  const image = IMAGE_EXT.has(ext);
  if (MIME_OF[ext] !== file.mimetype || (image && !IMAGE_TYPES.has(type)))
    throw new BadRequestException(
      IMAGE_TYPES.has(type)
        ? 'Only PDF, DOCX, JPG or PNG files are accepted'
        : 'Only PDF or DOCX files are accepted',
    );
  return image;
}

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

  // The caller's own document, or 404: someone else's id, or no id at all,
  // reads as not found.
  private async ownDocument(userId: string, id: string) {
    if (!OBJECT_ID.test(id)) throw new NotFoundException('Document not found');
    const jobSeekerId = await this.requireJobSeekerId(userId);
    const document = await this.documentService.findById(id);
    if (!document || document.job_seeker_id !== jobSeekerId)
      throw new NotFoundException('Document not found');
    return document;
  }

  private read(file: Express.Multer.File, image: boolean) {
    return image
      ? Promise.resolve(null)
      : this.textExtractionService.extract(file.buffer, file.mimetype);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async upload(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') rawType: unknown,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const parsedType = uploadTypeSchema.safeParse(rawType);
    if (!parsedType.success)
      throw new BadRequestException('Invalid document type');
    const type = parsedType.data as JobSeekerDocumentType;
    const image = checkFile(file, type);

    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    // A new CV starts a new batch once the current one was analyzed (and the
    // supporting documents move into it). Supporting documents join the
    // current batch, so adding one after Plato read the CV never hides it.
    const current =
      type === 'CV_RESUME'
        ? null
        : await this.versionService.getCurrent(jobSeekerId);
    const version =
      current ?? (await this.versionService.getOrCreateCurrent(jobSeekerId));

    // One CV per batch: a second one is a replacement, under the same limit.
    if (type === 'CV_RESUME') {
      const cv = (await this.documentService.listByVersion(version.id)).find(
        (d) => d.type === 'CV_RESUME',
      );
      if (cv) return this.replaceWith(cv, file, image);
    }

    const storageKey = await this.storageService.upload(
      file,
      `job-seeker-documents/${jobSeekerId}`,
    );

    let document: JobSeekerDocument;
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
      const text = await this.read(file, image);
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

    return this.shown(document);
  }

  // Only what the screens use: never the text, the storage key or the cache.
  private shown(d: object) {
    const out: Record<string, unknown> = { ...d };
    for (const k of ['extracted_text', 'storage_key', 'url', 'apply_json'])
      delete out[k];
    return out;
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const version = await this.versionService.getCurrent(jobSeekerId);
    const docs = await this.documentService.listLive(
      jobSeekerId,
      version?.id ?? null,
    );
    const used = new Map<string, number>();
    for (const id of new Set(docs.map((d) => d.document_version_id)))
      used.set(
        id,
        id === version?.id
          ? version.replacement_count
          : ((await this.versionService.findById(id))?.replacement_count ?? 0),
      );
    return docs.map((d) => ({
      ...d,
      remaining_replacements: Math.max(
        0,
        MAX_REPLACEMENTS_PER_VERSION - (used.get(d.document_version_id) ?? 0),
      ),
    }));
  }

  // Whether the profile is behind its documents: a CV or a certificate added
  // (or replaced) after Plato last read the batch, or a batch never read.
  @Get('status')
  async status(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const version = await this.versionService.getCurrent(jobSeekerId);
    if (!version) return { needs_analysis: false };
    const ready = (await this.documentService.listByVersion(version.id)).filter(
      (d) => d.status === 'READY',
    );
    const analyzed = version.analyzed_at;
    return {
      needs_analysis: analyzed
        ? ready.some((d) => d.created_at > analyzed)
        : ready.some((d) => d.type === 'CV_RESUME'),
    };
  }

  @Put(':id/replace')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async replace(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const document = await this.ownDocument(req.userId, id);
    return this.replaceWith(document, file, checkFile(file, document.type));
  }

  // The old file stays until the new one is read: a file Plato can't read
  // changes nothing and costs no replacement. Replacing a file that failed
  // to read is free too; only a working file swapped for another counts.
  private async replaceWith(
    document: JobSeekerDocument,
    file: Express.Multer.File,
    image: boolean,
  ) {
    const version = await this.versionService.findById(
      document.document_version_id,
    );
    const counts = document.status === 'READY';
    if (
      !version ||
      (counts && version.replacement_count >= MAX_REPLACEMENTS_PER_VERSION)
    ) {
      throw new ConflictException(
        `You've used the ${MAX_REPLACEMENTS_PER_VERSION} replacements for this document. Delete it and upload the new one, or for a CV, ask Plato to update your profile first and then upload the new CV.`,
      );
    }

    let text: string | null;
    try {
      text = await this.read(file, image);
    } catch (error) {
      throw new UnprocessableEntityException(
        `Plato could not read that file (${error instanceof Error ? error.message : 'unreadable'}). Your current document is unchanged: try a PDF.`,
      );
    }

    const storageKey = await this.storageService.upload(
      file,
      `job-seeker-documents/${document.job_seeker_id}`,
    );
    let updated: JobSeekerDocument;
    try {
      updated = await this.documentService.update(document.id, {
        status: 'READY',
        storage_key: storageKey,
        url: storageKey,
        name: file.originalname,
        extracted_text: text,
        processing_error: null,
        // The apply engine's parse of the old CV (extension/v3) must go.
        apply_json: null,
        // A new file: counts as added now, so the profile shows it needs a new read.
        created_at: new Date(),
      });
    } catch (error) {
      await this.storageService.delete(storageKey);
      throw error;
    }
    await this.storageService.delete(document.storage_key);

    const used = counts
      ? await this.versionService.incrementReplacementCount(version.id)
      : version.replacement_count;
    return {
      ...this.shown(updated),
      remaining_replacements: Math.max(0, MAX_REPLACEMENTS_PER_VERSION - used),
    };
  }

  // The file as uploaded (Profile → Preview). Private: owner only.
  @Get(':id/file')
  async file(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const document = await this.ownDocument(req.userId, id);
    const body = await this.storageService.getObjectBuffer(
      document.storage_key,
    );
    const ext = extname(document.storage_key).toLowerCase();
    const name = document.name ?? `document${ext}`;
    res
      .setHeader('Content-Type', MIME_OF[ext] ?? DOCX)
      .setHeader(
        'Content-Disposition',
        `inline; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      )
      .setHeader('Cache-Control', 'private, max-age=600')
      .send(body);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const document = await this.ownDocument(req.userId, id);
    await this.storageService.delete(document.storage_key);
    await this.documentService.remove(id);
    if (document.type === 'CV_RESUME') {
      const current = await this.versionService.getCurrent(
        document.job_seeker_id,
      );
      await this.documentService.retireOtherCvs(
        document.job_seeker_id,
        current?.id ?? null,
      );
      // and erased for good, file and row, where nothing still points at them
      await this.documentService.purgeRetiredCvs(document.job_seeker_id);
    }
    return { removed: id };
  }
}
