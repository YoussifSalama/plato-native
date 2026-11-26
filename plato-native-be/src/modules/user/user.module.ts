import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { JobSeekerService } from './job-seeker.service';
import { JobSeekerSocialLinkService } from './job-seeker-social-link.service';
import { JobSeekerDocumentService } from './job-seeker-document.service';
import { JobSeekerDocumentVersionService } from './job-seeker-document-version.service';
import { JobSeekerPreferenceService } from './job-seeker-preference.service';
import { JobSeekerProfileService } from './job-seeker-profile.service';
import { StorageService } from '../documents/storage.service';

@Module({
  providers: [
    UserService,
    JobSeekerService,
    JobSeekerSocialLinkService,
    JobSeekerDocumentService,
    JobSeekerDocumentVersionService,
    JobSeekerPreferenceService,
    JobSeekerProfileService,
    // Erasing retired CVs deletes their files. Provided here, not imported:
    // DocumentsModule imports this module.
    StorageService,
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
