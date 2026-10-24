import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { PreferencesController } from './preferences.controller';

@Module({
  imports: [UserModule, AuthModule],
  controllers: [PreferencesController],
})
export class PreferencesModule {}
