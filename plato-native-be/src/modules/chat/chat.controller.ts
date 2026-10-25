import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { chatRequestSchema } from './chat.schema';
import { ChatService } from './chat.service';
import { TokensGuard } from '../credits/tokens.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @UseGuards(TokensGuard)
  async chat(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const reply = await this.chatService.reply(
      parsed.data.messages,
      req.userId,
      parsed.data.stage,
    );
    return { reply };
  }
}
