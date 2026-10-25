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
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  answerSchema,
  InterviewService,
  startSchema,
} from './interview.service';
import { TokensGuard } from '../credits/tokens.guard';

@Controller('job-seeker/interviews')
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(private readonly interviews: InterviewService) {}

  @Post()
  @UseGuards(TokensGuard)
  start(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const p = startSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.interviews.start(req.userId, p.data);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.interviews.list(req.userId);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.interviews.get(req.userId, id);
  }

  @Post(':id/answer')
  @UseGuards(TokensGuard)
  answer(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = answerSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.interviews.answer(req.userId, id, p.data.answer);
  }
}
