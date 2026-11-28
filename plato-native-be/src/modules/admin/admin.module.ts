import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import {
  AdminManageController,
  AdminPagesController,
} from './admin-manage.controller';
import { AdminManageService } from './admin-manage.service';
import { AdminTokens } from './admin-tokens';

// Admin panel auth: sessions, the page guard, admins / roles / invites.
// Feature modules import this to use `@UseGuards(AdminGuard) @AdminPage('...')`
// (PrismaService and ConfigService, the guard's other deps, are global).
@Module({
  controllers: [
    AdminAuthController,
    AdminPagesController,
    AdminManageController,
  ],
  providers: [AdminTokens, AdminGuard, AdminAuthService, AdminManageService],
  exports: [AdminTokens, AdminGuard],
})
export class AdminModule {}
