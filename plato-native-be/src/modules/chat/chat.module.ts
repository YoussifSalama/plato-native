import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { ApplyModule } from '../apply/apply.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatThreadController } from './chat-thread.controller';
import { ChatThreadService } from './chat-thread.service';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [AuthModule, UserModule, DiscoveryModule, ApplyModule, CreditsModule],
  controllers: [ChatController, ChatThreadController],
  providers: [ChatService, ChatThreadService],
})
export class ChatModule {}
