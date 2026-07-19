import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { StorageModule, CommonModule } from 'src/common';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';
import { TokenUsageService } from './token-usage.service';
import { StreakReminderService } from './streak-reminder.service';
@Module({
  imports: [StorageModule, CommonModule],
  controllers: [UserController],
  providers: [
    UserService,
    TextToSpeechService,
    TokenUsageService,
    StreakReminderService,
  ],
  exports: [TokenUsageService], // Export so other modules can use it
})
export class UserModule {}
