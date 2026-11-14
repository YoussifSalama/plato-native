import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TokensGuard } from '../credits/tokens.guard';
import { createSchema, QuizzesService, submitSchema } from './quizzes.service';

// Quiz Builder endpoints (quiz.contract.ts). Library routes come before ":id" so "library" is never read as an id.
@Controller('job-seeker/quizzes')
@UseGuards(JwtAuthGuard)
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.quizzes.list(req.userId);
  }

  @Get('library')
  library(@Query('q') q?: string) {
    return this.quizzes.library(q);
  }

  // A library quiz needs no AI: no tokens, no TokensGuard.
  @Post('library/:id/take')
  take(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.quizzes.take(req.userId, id);
  }

  // Building a quiz spends tokens (the AI steps are metered to the seeker).
  @Post()
  @UseGuards(TokensGuard)
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const p = createSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.quizzes.create(req.userId, p.data);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.quizzes.get(req.userId, id);
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.quizzes.remove(req.userId, id);
  }

  @Post(':id/attempts')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const p = submitSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.quizzes.submit(req.userId, id, p.data);
  }

  @Get(':id/attempts/:attemptId')
  attempt(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.quizzes.attempt(req.userId, id, attemptId);
  }
}
