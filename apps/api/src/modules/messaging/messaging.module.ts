import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ConversationService } from './services/conversation.service';
import { MessageService } from './services/message.service';
import { PresenceService } from './services/presence.service';
import { TypingService } from './services/typing.service';
import { BlockReportService } from './services/block-report.service';
import { MessagingGateway } from './realtime/messaging.gateway';
import { MessagingDispatcherService } from './realtime/messaging-dispatcher.service';
import { ConversationController } from './controllers/conversation.controller';
import { MessageController } from './controllers/message.controller';
import { UserBlockController } from './controllers/user-block.controller';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    forwardRef(() => OutboxModule),
  ],
  providers: [
    ConversationService,
    MessageService,
    PresenceService,
    TypingService,
    BlockReportService,
    MessagingGateway,
    MessagingDispatcherService,
  ],
  controllers: [
    ConversationController,
    MessageController,
    UserBlockController,
  ],
  exports: [
    ConversationService,
    MessageService,
    PresenceService,
    TypingService,
    BlockReportService,
    MessagingGateway,
    MessagingDispatcherService,
  ],
})
export class MessagingModule {}
