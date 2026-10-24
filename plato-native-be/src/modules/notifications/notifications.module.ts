import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { NotificationsBus } from './notifications.bus';
import { NotificationsController } from './notifications.controller';

// Global so any feature module can publish without import plumbing.
@Global()
@Module({
  imports: [UserModule, AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsBus],
  exports: [NotificationsBus],
})
export class NotificationsModule {}
