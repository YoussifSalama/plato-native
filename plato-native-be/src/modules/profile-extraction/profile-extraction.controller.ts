import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobSeekerService } from '../user/job-seeker.service';
import { JobSeekerDocumentService } from '../user/job-seeker-document.service';
import { JobSeekerDocumentVersionService } from '../user/job-seeker-document-version.service';
import { JobSeekerProfileService } from '../user/job-seeker-profile.service';
import { ProfileExtractionAgentService } from './profile-extraction-agent.service';
import { ProfileEvaluationService } from './profile-evaluation.service';
import { profileEditSchema } from './profile-edit.schema';
import { Finding } from './profile-extraction.schema';

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

@Controller('job-seeker/profile')
@UseGuards(JwtAuthGuard)
export class ProfileExtractionController {
  constructor(
    private readonly jobSeekerService: JobSeekerService,
    private readonly documentService: JobSeekerDocumentService,
    private readonly versionService: JobSeekerDocumentVersionService,
    private readonly profileService: JobSeekerProfileService,
    private readonly agentService: ProfileExtractionAgentService,
    private readonly evaluationService: ProfileEvaluationService,
  ) {}

  private async requireJobSeekerId(userId: string) {
    const jobSeeker = await this.jobSeekerService.getByUserId(userId);
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    return jobSeeker.id;
  }

  @Post('analyze')
  async analyze(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);

    const version = await this.versionService.getCurrent(jobSeekerId);
    if (!version) throw new ConflictException('Upload a CV before analyzing');

    const documents = await this.documentService.listByVersion(version.id);
    const hasReadyCv = documents.some(
      (d) => d.type === 'CV_RESUME' && d.status === 'READY',
    );
    if (!hasReadyCv) {
      throw new ConflictException(
        'A successfully processed CV is required before analyzing',
      );
    }

    // Optional documents that failed extraction are excluded, not blocking.
    const readyDocs = documents.filter((d) => d.status === 'READY');
    const combinedText = readyDocs
      .map((d) => `# ${d.type}: ${d.name ?? 'document'}\n${d.extracted_text}`)
      .join('\n\n');

    const rawExtraction = await this.agentService.extract(combinedText);
    // Defense-in-depth against the model padding a list with a blank
    // entry — drop anything missing its required text field(s) rather
    // than trust the prompt alone.
    const extraction = {
      ...rawExtraction,
      experience: rawExtraction.experience.filter((e) => e.company && e.title),
      education: rawExtraction.education.filter(
        (e) => e.institution && e.degree,
      ),
      certifications: rawExtraction.certifications.filter((c) => c.name),
      languages: rawExtraction.languages.filter((l) => l.language),
    };
    const deterministic = this.evaluationService.evaluate(extraction);
    const evaluation = this.evaluationService.deriveStatuses(
      deterministic,
      extraction.findings,
    );
    const findings = this.evaluationService.augmentFindings(
      deterministic,
      extraction.findings,
    );

    await this.profileService.replaceProfile(jobSeekerId, {
      experiences: extraction.experience.map((e) => ({
        company: e.company,
        title: e.title,
        start_date: parseDate(e.start_date),
        end_date: parseDate(e.end_date),
        description: e.description ?? undefined,
        technologies: e.technologies,
      })),
      educations: extraction.education.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field ?? undefined,
        start_date: parseDate(e.start_date),
        end_date: parseDate(e.end_date),
      })),
      certifications: extraction.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer ?? undefined,
        issue_date: parseDate(c.issue_date),
        expiration_date: parseDate(c.expiration_date),
      })),
      languages: extraction.languages.map((l) => ({
        language: l.language,
        proficiency: l.proficiency ?? undefined,
      })),
      skills: extraction.skills,
      location: extraction.location,
      evaluation,
      findings,
    });

    // A version is a document batch, not an analysis run — mark it consumed,
    // don't bump the counter. The next upload lazily starts a new batch.
    await this.versionService.markAnalyzed(version.id);

    const profile = await this.profileService.getFullProfile(jobSeekerId);
    return { profile, evaluation };
  }

  @Patch()
  async saveProfile(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);

    const parsed = profileEditSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const input = parsed.data;

    const deterministic = this.evaluationService.evaluate({
      experience: input.experiences.map((e) => ({
        company: e.company,
        title: e.title,
        start_date: e.start_date ?? null,
        end_date: e.end_date ?? null,
        description: e.description ?? null,
        technologies: e.technologies ?? [],
      })),
      education: input.educations.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field ?? null,
        start_date: e.start_date ?? null,
        end_date: e.end_date ?? null,
      })),
      skills: input.skills,
      certifications: input.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer ?? null,
        issue_date: c.issue_date ?? null,
        expiration_date: c.expiration_date ?? null,
      })),
      languages: input.languages.map((l) => ({
        language: l.language,
        proficiency: l.proficiency ?? null,
      })),
      location: {
        city: input.location?.city ?? '',
        country: input.location?.country ?? '',
      },
    });

    // The user just manually reviewed and saved whatever sections they
    // touched — any AI finding naming one of those sections no longer
    // applies. Findings on sections they never touched carry over as-is.
    const existing = await this.profileService.getEvaluation(jobSeekerId);
    const priorFindings = (
      (existing?.findings as Finding[] | null) ?? []
    ).filter(
      (finding) =>
        !finding.sections.some((section) =>
          input.editedSections.includes(section),
        ),
    );
    const evaluation = this.evaluationService.deriveStatuses(
      deterministic,
      priorFindings,
    );
    const findings = this.evaluationService.augmentFindings(
      deterministic,
      priorFindings,
    );

    await this.profileService.replaceProfile(jobSeekerId, {
      experiences: input.experiences.map((e) => ({
        company: e.company,
        title: e.title,
        start_date: parseDate(e.start_date),
        end_date: parseDate(e.end_date),
        description: e.description ?? undefined,
        technologies: e.technologies ?? [],
      })),
      educations: input.educations.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field ?? undefined,
        start_date: parseDate(e.start_date),
        end_date: parseDate(e.end_date),
      })),
      certifications: input.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer ?? undefined,
        issue_date: parseDate(c.issue_date),
        expiration_date: parseDate(c.expiration_date),
      })),
      languages: input.languages.map((l) => ({
        language: l.language,
        proficiency: l.proficiency ?? undefined,
      })),
      skills: input.skills,
      location: input.location,
      evaluation,
      findings,
    });

    const profile = await this.profileService.getFullProfile(jobSeekerId);
    return { profile, evaluation };
  }

  @Get()
  async getProfile(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.profileService.getFullProfile(jobSeekerId);
  }
}
