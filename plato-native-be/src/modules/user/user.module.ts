import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { JobSeekerService } from './job-seeker.service';
import { JobSeekerSocialLinkService } from './job-seeker-social-link.service';
import { JobSeekerDocumentService } from './job-seeker-document.service';
import { JobSeekerDocumentVersionService } from './job-seeker-document-version.service';
import { JobSeekerPreferenceService } from './job-seeker-preference.service';
import { JobSeekerProfileService } from './job-seeker-profile.service';

@Module({
  providers: [
    UserService,
    JobSeekerService,
    JobSeekerSocialLinkService,
    JobSeekerDocumentService,
    JobSeekerDocumentVersionService,
    JobSeekerPreferenceService,
    JobSeekerProfileService,
  ],
  exports: [
    UserService,
    JobSeekerService,
    JobSeekerSocialLinkService,
    JobSeekerDocumentService,
    JobSeekerDocumentVersionService,
    JobSeekerPreferenceService,
    JobSeekerProfileService,
  ],
})
export class UserModule {}
