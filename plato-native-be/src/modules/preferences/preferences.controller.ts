import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { run } from '@openai/agents';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobSeekerService } from '../user/job-seeker.service';
import { JobSeekerPreferenceService } from '../user/job-seeker-preference.service';
import { JobSeekerProfileService } from '../user/job-seeker-profile.service';
import { IEnvParams } from '../../types/config/env.types';
import { createPreferenceSuggestionAgent } from './preferences-suggestion.agent';
import { Prisma } from '@prisma/client';
import {
  preferenceEditSchema,
  preferenceEstimateSchema,
} from './preferences.schema';
import { PrismaService } from '../prisma/prisma.service';
import { indexFilter } from '../discovery/adapters/local-index.adapter';
import { resolveCountry } from '../discovery/countries';
import { checkSalary } from '../discovery/salary-sanity';
import { metered } from '../usage/usage';

@Controller('job-seeker/preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(
    private readonly jobSeekerService: JobSeekerService,
    private readonly preferenceService: JobSeekerPreferenceService,
    private readonly profileService: JobSeekerProfileService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async requireJobSeekerId(userId: string) {
    const jobSeeker = await this.jobSeekerService.getByUserId(userId);
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    return jobSeeker.id;
  }

  @Get()
  async getPreferences(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);

    const existing = await this.preferenceService.get(jobSeekerId);
    if ('id' in existing) return existing;

    // No preferences yet — generate a one-time suggestion from the
    // already-confirmed structured profile (not raw documents).
    const profile = await this.profileService.getFullProfile(jobSeekerId);
    const model =
      this.configService.get<IEnvParams>('env')!.profileExtractionModel;
    const agent = createPreferenceSuggestionAgent(model);
    const result = metered(
      'onboarding.preferences',
      model,
      await run(agent, JSON.stringify(profile)),
    );
    const suggestion = result.finalOutput;
    if (!suggestion)
      throw new BadRequestException(
        'Could not generate preference suggestions',
      );

    return this.preferenceService.upsert(jobSeekerId, {
      roles: suggestion.roles,
      preferred_job_types: suggestion.employment_types,
      preferred_industries: suggestion.industries,
      preferred_locations: suggestion.locations,
      work_setup: suggestion.work_setup,
      salary_min: suggestion.salary_min,
      salary_max: suggestion.salary_max,
      salary_currency: suggestion.salary_currency,
      seniority: suggestion.seniority,
      years_experience: suggestion.years_experience,
      source: 'AI_SUGGESTED',
    });
  }

  @Patch()
  async savePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);

    const parsed = preferenceEditSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    // Continue always means confirmed — source is never client-supplied.
    return this.preferenceService.upsert(jobSeekerId, {
      ...parsed.data,
      source: 'USER_CONFIRMED',
    });
  }

  // Onboarding, while the seeker edits (owner screen 02): "With these settings
  // Plato sees about N open jobs" and whether the salary is in the usual range.
  // Cheap: one count over the local index, no AI, no tokens.
  @Post('estimate')
  @HttpCode(200)
  async estimate(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = preferenceEstimateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const p = parsed.data;
    const seeker = await this.jobSeekerService.getByUserId(req.userId);
    if (!seeker) throw new NotFoundException('Job seeker profile not found');

    const remoteTypes = p.work_setup.filter(
      (w): w is 'onsite' | 'hybrid' | 'remote' | 'any' =>
        ['onsite', 'hybrid', 'remote', 'any'].includes(w),
    );
    let openJobs = 0;
    if (p.roles.length) {
      const res = (await this.prisma.job.aggregateRaw({
        pipeline: [
          {
            $match: indexFilter({
              titles: p.roles,
              locations: p.preferred_locations,
              remoteTypes,
              willingToRelocate: !!p.willing_to_relocate,
            }),
          },
          { $count: 'n' },
        ] as Prisma.InputJsonValue[],
      })) as unknown as { n: number }[];
      openJobs = res[0]?.n ?? 0;
    }

    const amount = p.salary_max ?? p.salary_min;
    const home = seeker.location as { city?: string; country?: string } | null;
    const residence = home
      ? resolveCountry([home.city, home.country].filter(Boolean).join(', '))
      : null;
    const targets = [
      ...new Set(
        p.preferred_locations
          .map((l) => resolveCountry(l))
          .filter((c): c is string => !!c),
      ),
    ];
    const salary =
      amount && p.salary_currency
        ? checkSalary({
            amount,
            currency: p.salary_currency,
            period: p.salary_period ?? 'MONTHLY',
            residence,
            targets,
            remote: remoteTypes.includes('remote'),
          })
        : null;
    return { openJobs, salary };
  }
}
