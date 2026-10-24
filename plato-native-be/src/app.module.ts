import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UsageContextInterceptor } from './modules/usage/usage';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import envConfig from './config/env/env.config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { UserModule } from './modules/user/user.module';
import { UploadModule } from './modules/upload/upload.module';
import { AuthModule } from './modules/auth/auth.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ProfileExtractionModule } from './modules/profile-extraction/profile-extraction.module';
import { ChatModule } from './modules/chat/chat.module';
import { CareerModule } from './modules/career/career.module';
import { InterviewModule } from './modules/interview/interview.module';
import { SkillsModule } from './modules/skills/skills.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { ApplyModule } from './modules/apply/apply.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UsageModule } from './modules/usage/usage.module';
import { ExtensionModule } from './modules/extension/extension.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    PrismaModule,
    UserModule,
    UploadModule,
    AuthModule,
    DocumentsModule,
    ProfileExtractionModule,
    ChatModule,
    CareerModule,
    InterviewModule,
    SkillsModule,
    PreferencesModule,
    DiscoveryModule,
    ApplyModule,
    NotificationsModule,
    UsageModule,
    ExtensionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: UsageContextInterceptor },
  ],
})
export class AppModule {}
