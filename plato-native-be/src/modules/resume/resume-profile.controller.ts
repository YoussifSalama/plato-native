import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeProfileService } from './resume-profile.service';

const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const projectSchema = z.object({
  name: text(120),
  role: optional(120),
  description: text(1200),
  technologies: z.array(text(40)).max(20).default([]),
  url: optional(300),
  result: optional(400),
});
const achievementSchema = z.object({
  text: text(400),
  metric: optional(60),
  company: optional(120),
  projectName: optional(120),
});
const skillSchema = z.object({
  skill: text(60),
  level: z.enum(['LEARNING', 'WORKING', 'STRONG']),
  proof: text(600),
  url: optional(300),
});
const settingsSchema = z.object({
  nationality: optional(60),
  market: z
    .enum(['US', 'CA', 'UK', 'DE', 'EU', 'GCC', 'EG', 'OTHER'])
    .optional(),
  personalBlock: z.boolean().optional(),
});

// The candidate facts every resume is built from: edited here, used everywhere.
@Controller('job-seeker/resume-profile')
@UseGuards(JwtAuthGuard)
export class ResumeProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ResumeProfileService,
  ) {}

  private async seekerId(userId: string) {
    const s = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!s) throw new NotFoundException('Job seeker profile not found');
    return s.id;
  }

  private parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
    const r = schema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.issues);
    return r.data;
  }

  @Get()
  async facts(@Req() req: AuthenticatedRequest) {
    return this.profiles.facts(await this.seekerId(req.userId));
  }

  @Post('projects')
  async addProject(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.profiles.addProject(
      await this.seekerId(req.userId),
      this.parse(projectSchema, body),
    );
  }

  @Post('achievements')
  async addAchievement(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.profiles.addAchievement(
      await this.seekerId(req.userId),
      this.parse(achievementSchema, body),
    );
  }

  @Post('skills')
  async addSkill(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.profiles.upsertSkillEvidence(
      await this.seekerId(req.userId),
      this.parse(skillSchema, body),
    );
  }

  @Put('settings')
  async settings(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    await this.profiles.saveSettings(
      await this.seekerId(req.userId),
      this.parse(settingsSchema, body),
    );
    return { saved: true };
  }

  @Delete(':kind/:id')
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    if (kind !== 'projects' && kind !== 'achievements' && kind !== 'skills')
      throw new NotFoundException();
    await this.profiles.remove(await this.seekerId(req.userId), kind, id);
    return { removed: true };
  }
}
