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
import { TokensGuard } from '../credits/tokens.guard';
import {
  AssessmentsService,
  submitAssessmentSchema,
} from './assessments.service';

// Standard assessments (quiz.contract.ts). "profile" routes come before ":slug" so "profile" is never read as a slug.
@Controller('job-seeker/assessments')
@UseGuards(JwtAuthGuard)
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.assessments.list(req.userId);
  }

  @Get('profile')
  profile(@Req() req: AuthenticatedRequest) {
    return this.assessments.profile(req.userId);
  }

  // The only AI step here: the written report spends tokens; taking assessments is free.
  @Post('profile/report')
  @UseGuards(TokensGuard)
  report(@Req() req: AuthenticatedRequest) {
    return this.assessments.writeReport(req.userId);
  }

  @Get(':slug')
  get(@Req() req: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.assessments.get(req.userId, slug);
  }

  @Post(':slug/attempts')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    const p = submitAssessmentSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    return this.assessments.submit(req.userId, slug, p.data);
  }

  @Get(':slug/attempts/:attemptId')
  attempt(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.assessments.attempt(req.userId, slug, attemptId);
  }
}
