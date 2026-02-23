import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReflectionController } from './reflection.controller';
import { ReflectionService } from './reflection.service';
import { DatabaseModule } from 'src/database/database.module';
import { StorageModule } from 'src/common/storage/storage.module';
import { TranscriptionService } from './services/transcription.service';
import { NlpTransformationService } from './services/nlp-transformation.service';
import { TextToSpeechService } from './services/text-to-speech.service';
import { SessionExpirationService } from './services/session-expiration.service';
import { CommonModule } from 'src/common/common.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UserModule } from 'src/user/user.module';
import { StaterVideosModule } from 'src/stater-videos/stater-videos.module';

@Module({
    imports: [
        CommonModule,
        DatabaseModule,
        StorageModule,
        NotificationsModule,
        UserModule, // Import to access TokenUsageService
        StaterVideosModule,
        ScheduleModule.forRoot()
    ],
    controllers: [ReflectionController],
    providers: [
        ReflectionService,
        TranscriptionService,
        NlpTransformationService,
        TextToSpeechService,
        SessionExpirationService,
    ],
    exports: [ReflectionService],
})
export class ReflectionModule { }

