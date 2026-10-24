import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatThreadService } from './chat-thread.service';

const sendSchema = z.object({
  content: z.string().trim().min(1).max(2000),
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
    );
  }
}
