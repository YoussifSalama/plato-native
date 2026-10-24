import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CareerService } from './career.service';
import { CareerResumesService } from './career-resumes.service';
import {
  CareerVoiceService,
  voiceStartSchema,
  voiceTranscriptSchema,
} from './career-voice.service';
import { docEditsSchema } from '../resume/resume-edit';

// Long enough for a pasted job description.
const sendSchema = z.object({
  content: z.string().trim().min(1).max(12000),
  // Documents already uploaded by this seeker (a CV to improve).
  attachmentIds: z.array(z.string().min(1).max(40)).max(3).optional(),
  // A job pinned to the message (job card -> mock interview); must be one of the seeker's matches.
  reference: z.object({ jobId: z.string().regex(/^[0-9a-f]{24}$/), searchId: z.string().regex(/^[0-9a-f]{24}$/).optional() }).optional(),
});

const suggestSchema = z.object({
  section: z.enum(['summary', 'experience', 'project']),
  index: z.number().int().min(0).max(30).optional(),
  note: z.string().trim().max(200).optional(),
});

@Controller('job-seeker/career')
@UseGuards(JwtAuthGuard)
export class CareerController {
  constructor(
    private readonly career: CareerService,
    private readonly resumes: CareerResumesService,
    private readonly voice: CareerVoiceService,
  ) {}

  @Post('threads')
  create(@Req() req: AuthenticatedRequest) {
    return this.career.create(req.userId);
  }

  @Get('threads')
  list(@Req() req: AuthenticatedRequest) {
    return this.career.list(req.userId);
  }

  @Get('threads/:id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.career.get(req.userId, id);
  }

  @Post('threads/:id/messages')
  send(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.career.send(
      req.userId,
      id,
      parsed.data.content,
      undefined,
      parsed.data.attachmentIds,
      undefined,
      parsed.data.reference,
    );
  }

  // Same as POST messages, but the reply streams in as it is written:
  // `delta` events with text pieces, then one `done` with the saved message.
  @Post('threads/:id/messages/stream')
  async stream(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    res
      .setHeader('Content-Type', 'text/event-stream')
      .setHeader('Cache-Control', 'no-cache, no-transform')
      .setHeader('X-Accel-Buffering', 'no')
      .flushHeaders();
    const emit = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const { message } = await this.career.send(
        req.userId,
        id,
        parsed.data.content,
        (text) => emit('delta', { text }),
        parsed.data.attachmentIds,
        (text) => emit('status', { text }),
        parsed.data.reference,
      );
      emit('done', { message });
    } catch (e) {
      emit('error', {
        message: e instanceof Error ? e.message : 'Something went wrong',
      });
    }
    res.end();
  }

  // Voice interview: a short-lived key for the browser's WebRTC call to OpenAI.
  @Post('threads/:id/voice/session')
  voiceSession(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = voiceStartSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.voice.start(req.userId, id, parsed.data);
  }

  // The finished call's transcript, saved into the chat.
  @Post('threads/:id/voice/transcript')
  voiceTranscript(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = voiceTranscriptSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.voice.saveTranscript(req.userId, id, parsed.data);
  }

  @Get('resumes')
  listResumes(@Req() req: AuthenticatedRequest) {
    return this.resumes.list(req.userId);
  }

  @Get('resumes/:id')
  getResume(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.resumes.get(req.userId, id);
  }

  // Saves the seeker's wording as the next version and redraws the PDF.
  @Put('resumes/:id')
  editResume(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = docEditsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.resumes.edit(req.userId, id, parsed.data);
  }

  @Post('resumes/:id/suggest')
  suggest(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = suggestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.resumes.suggest(req.userId, id, parsed.data);
  }

  @Post('resumes/:id/approve')
  approveResume(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.resumes.approve(req.userId, id);
  }

  // A resume built in the chat. Private: owner only.
  @Get('resumes/:id/pdf')
  async pdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.career.resumePdf(req.userId, id);
    res
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Cache-Control', 'private, max-age=3600')
      .send(pdf);
  }
}
