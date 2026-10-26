import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsAdminController } from './credits-admin.controller';
import { CreditsController } from './credits.controller';

@Module({
  imports: [AuthModule],
  controllers: [CreditsController, CreditsAdminController],
})
export class CreditsModule {}
