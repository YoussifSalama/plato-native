import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ExtensionAuthGuard, ExtensionRequest, ExtensionScopes } from '../extension-auth.guard';
import { turnRequestSchema } from './v3-contract';
import { V3SessionService } from './v3-session.service';

// Engine v3 routes, token-authenticated like the rest of /extension/v1.
@Controller('extension/v1')
@UseGuards(ExtensionAuthGuard)
export class V3Controller {
  constructor(private readonly sessions: V3SessionService) {}

  /** One model turn: the executor posts what happened, gets the next browser actions or the outcome. */
  @Post('items/:id/v3/turn')
  @ExtensionScopes('apply:write')
  async turn(@Req() req: ExtensionRequest, @Param('id') id: string, @Body() body: unknown) {
    const p = turnRequestSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(`Invalid request: ${p.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    return this.sessions.turn(req.extension, id, p.data);
  }

  @Get('items/:id/v3/status')
  @ExtensionScopes('apply:read')
  status(@Req() req: ExtensionRequest, @Param('id') id: string) {
    return this.sessions.status(req.extension, id) ?? { session: null };
  }
}
