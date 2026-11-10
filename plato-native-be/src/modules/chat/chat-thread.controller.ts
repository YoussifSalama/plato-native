import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatThreadService } from './chat-thread.service';
import { TokensGuard } from '../credits/tokens.guard';

const sendSchema = z.object({
  // Long enough for a pasted job description (career coaching runs here too).
  content: z.string().trim().min(1).max(12000),
  // Documents already uploaded by this seeker (a CV to improve).
  attachmentIds: z.array(z.string().min(1).max(40)).max(3).optional(),
  // A job pinned to the message (job card -> tailor / mock interview); must be one of the seeker's matches.
  reference: z
    .object({
      jobId: z.string().regex(/^[0-9a-f]{24}$/),
      searchId: z
        .string()
        .regex(/^[0-9a-f]{24}$/)
        .optional(),
    })
    .optional(),
  context: z
    .object({
      view: z.enum(['chat', 'searching', 'results']).optional(),
      tab: z.enum(['discover', 'saved', 'applied', 'recommended']).optional(),
      q: z.string().max(200).optional(),
      selectedCount: z.number().int().min(0).optional(),
      page: z.string().max(40).optional(),
      // What the results list shows right now, in order, and the filters applied.
      visible: z
        .array(
          z.object({
            title: z.string().max(120),
            company: z.string().max(80),
            location: z.string().max(80).nullable().optional(),
            remote: z.string().max(12).optional(),
          }),
        )
        .max(15)
        .optional(),
      filters: z
        .record(
          z.string().max(20),
          z.union([z.string().max(60), z.number(), z.boolean()]),
        )
        .optional(),
      sort: z.string().max(12).optional(),
      // A follow-up the app sends by itself after a page change, so the assistant can keep going.
      auto: z.boolean().optional(),
      // A reading of the page the seeker is looking at: headings, text and every
      // control with an id the assistant can click or type into.
      pageMap: z
        .object({
          url: z.string().max(200),
          title: z.string().max(120).optional(),
          headings: z.array(z.string().max(120)).max(20).optional(),
          text: z.string().max(1800).optional(),
          elements: z
            .array(
              z.object({
                id: z.string().max(80),
                kind: z.enum([
                  'link',
                  'button',
                  'tab',
                  'input',
                  'select',
                  'checkbox',
                ]),
                label: z.string().max(100),
                href: z.string().max(160).optional(),
                value: z.string().max(60).optional(),
                on: z.boolean().optional(),
              }),
            )
            .max(90),
        })
        .optional(),
    })
    .optional(),
});

@Controller('chat/threads')
@UseGuards(JwtAuthGuard)
export class ChatThreadController {
  constructor(private readonly threads: ChatThreadService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest) {
    return this.threads.create(req.userId);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.threads.list(req.userId);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.threads.get(req.userId, id);
  }

  @Post(':id/messages')
  @UseGuards(TokensGuard)
  send(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.threads.send(
      req.userId,
      id,
      parsed.data.content,
      parsed.data.context,
      {
        attachmentIds: parsed.data.attachmentIds,
        reference: parsed.data.reference,
      },
    );
  }

  // Same as POST messages, but the reply streams in as it is written: `delta`
  // events with text pieces, `status` while a tool runs, then one `done` with the
  // saved message and the page events.
  @Post(':id/messages/stream')
  @UseGuards(TokensGuard)
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
      const out = await this.threads.send(
        req.userId,
        id,
        parsed.data.content,
        parsed.data.context,
        {
          attachmentIds: parsed.data.attachmentIds,
          reference: parsed.data.reference,
          onDelta: (text) => emit('delta', { text }),
          onStatus: (text) => emit('status', { text }),
        },
      );
      emit('done', out);
    } catch (e) {
      emit('error', {
        message: e instanceof Error ? e.message : 'Something went wrong',
      });
    }
    res.end();
  }
}
