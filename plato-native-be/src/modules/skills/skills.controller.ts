import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SkillsService } from './skills.service';

const credentialSchema = z.object({
  skill: z.string().trim().min(1).max(60),
  courseId: z.string().max(60).optional(),
  title: z.string().trim().min(2).max(160).optional(),
  provider: z.string().trim().max(80).optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
  credentialUrl: z.string().url().max(500).optional(),
  documentId: z.string().max(40).optional(),
  completedAt: z.coerce.date().optional(),
});

@Controller('job-seeker/skills')
@UseGuards(JwtAuthGuard)
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  // "Power BI is missing in 180 of your jobs": skills your best matches ask for that your profile does not prove.
  @Get('gap')
  gap(@Req() req: AuthenticatedRequest) {
    return this.skills.gap(req.userId);
  }

  @Get('credentials')
  credentials(@Req() req: AuthenticatedRequest) {
    return this.skills.credentials(req.userId);
  }

  // Mark a course in progress or completed; with the public link it is checked.
  @Post('credentials')
  add(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = credentialSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.skills.addCredential(req.userId, parsed.data);
  }

  @Patch('credentials/:id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = credentialSchema.partial().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.skills.updateCredential(req.userId, id, parsed.data);
  }

  @Delete('credentials/:id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.skills.removeCredential(req.userId, id);
  }
}
