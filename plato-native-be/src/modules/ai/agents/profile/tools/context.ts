import { JobSeekerService } from '../../../../user/job-seeker.service';
import { JobSeekerDocumentService } from '../../../../user/job-seeker-document.service';
import { JobSeekerDocumentVersionService } from '../../../../user/job-seeker-document-version.service';
import { JobSeekerSocialLinkService } from '../../../../user/job-seeker-social-link.service';
import { JobSeekerPreferenceService } from '../../../../user/job-seeker-preference.service';

export interface ProfileAgentContext {
  userId: string;
  jobSeekerService: JobSeekerService;
  jobSeekerDocumentService: JobSeekerDocumentService;
  jobSeekerDocumentVersionService: JobSeekerDocumentVersionService;
  jobSeekerSocialLinkService: JobSeekerSocialLinkService;
  jobSeekerPreferenceService: JobSeekerPreferenceService;
}

export async function requireJobSeekerId(ctx: ProfileAgentContext) {
  const jobSeeker = await ctx.jobSeekerService.getByUserId(ctx.userId);
  if (!jobSeeker)
    throw new Error(`No job seeker profile for user ${ctx.userId}`);
  return jobSeeker.id;
}
