import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { DocumentsModule } from '../documents/documents.module';
import { ProfileExtractionModule } from '../profile-extraction/profile-extraction.module';
import { UserModule } from '../user/user.module';
import { GuestClaimController, GuestController } from './guest.controller';
import { GuestService } from './guest.service';

// The public /search page: a CV and a LinkedIn search before signing up, moved onto the account after.
@Module({
  imports: [
    AuthModule,
    UserModule,
    DocumentsModule,
    ProfileExtractionModule,
    DiscoveryModule,
  ],
  controllers: [GuestController, GuestClaimController],
  providers: [GuestService],
})
export class GuestModule {}
