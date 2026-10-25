import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsController } from './credits.controller';

@Module({ imports: [AuthModule], controllers: [CreditsController] })
export class CreditsModule {}
