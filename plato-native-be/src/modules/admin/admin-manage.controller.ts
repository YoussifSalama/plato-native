import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAnyPage,
  AdminGuard,
  AdminPage,
  type AdminRequest,
} from './admin-auth.guard';
import { GRANTABLE_PAGES, PAGE_LABELS } from './admin-pages';
import { AdminManageService } from './admin-manage.service';
import {
  createInviteSchema,
  createRoleSchema,
  objectId,
  parse,
  updateAdminSchema,
  updateRoleSchema,
} from './admin.schema';

/** The keys a role can grant (the role editor's checkboxes). */
@Controller('admin/pages')
@UseGuards(AdminGuard)
@AdminAnyPage()
export class AdminPagesController {
  @Get()
  list() {
    return GRANTABLE_PAGES.map((key) => ({ key, label: PAGE_LABELS[key] }));
  }
}

/** Admins, roles, invitations: super admin only (the "admin" page is never grantable). */
@Controller('admin')
@UseGuards(AdminGuard)
@AdminPage('admin')
export class AdminManageController {
  constructor(private readonly manage: AdminManageService) {}

  @Get('admins')
  listAdmins() {
    return this.manage.listAdmins();
  }

  @Patch('admins/:id')
  updateAdmin(@Param('id') id: string, @Body() body: unknown) {
    return this.manage.updateAdmin(
      objectId(id),
      parse(updateAdminSchema, body),
    );
  }

  @Post('admins/:id/reset-2fa')
  @HttpCode(200)
  resetTwoFactor(@Param('id') id: string) {
    return this.manage.resetTwoFactor(objectId(id));
  }

  @Get('roles')
  listRoles() {
    return this.manage.listRoles();
  }

  @Post('roles')
  createRole(@Body() body: unknown) {
    return this.manage.createRole(parse(createRoleSchema, body));
  }

  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() body: unknown) {
    return this.manage.updateRole(objectId(id), parse(updateRoleSchema, body));
  }

  @Delete('roles/:id')
  deleteRole(@Param('id') id: string) {
    return this.manage.deleteRole(objectId(id));
  }

  @Get('invites')
  listInvites() {
    return this.manage.listInvites();
  }

  @Post('invites')
  createInvite(@Req() req: AdminRequest, @Body() body: unknown) {
    return this.manage.createInvite(
      parse(createInviteSchema, body),
      req.admin.id,
    );
  }

  @Post('invites/:id/resend')
  @HttpCode(200)
  resendInvite(@Param('id') id: string) {
    return this.manage.resendInvite(objectId(id));
  }

  @Delete('invites/:id')
  revokeInvite(@Param('id') id: string) {
    return this.manage.revokeInvite(objectId(id));
  }
}
