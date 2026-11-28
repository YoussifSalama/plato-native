import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { validateEnv } from './config/env/validate-env';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { UsageContextInterceptor } from './modules/usage/usage';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import envConfig from './config/env/env.config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { UserModule } from './modules/user/user.module';
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
import { CreditsModule } from './modules/credits/credits.module';
import { MailModule } from './modules/mail/mail.module';
import { InsightsModule } from './modules/insights/insights.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { GuestModule } from './modules/guest/guest.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { ErrorLogModule } from './modules/error-log/error-log.module';
import { ErrorLogFilter, ErrorLogStamp } from './modules/error-log/error-log.service';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
      // Stop at boot, with every missing or malformed setting named.
      validate: validateEnv,
    }),
    PrismaModule,
    UserModule,
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
    CreditsModule,
    MailModule,
    InsightsModule,
    QuizzesModule,
    GuestModule,
    AdminModule,
    AdminUsersModule,
    ErrorLogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: UsageContextInterceptor },
    // Sentry's filter (reports unexpected errors when SENTRY_DSN is set, then answers as Nest
    // normally does), extended to note the exception on the request for the error log.
    { provide: APP_FILTER, useClass: ErrorLogFilter },
    // Allows everything; remembers the controller so a failed request is logged under its module.
    { provide: APP_GUARD, useClass: ErrorLogStamp },
  ],
})
export class AppModule {}
