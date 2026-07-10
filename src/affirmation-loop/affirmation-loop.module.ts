import { Module } from '@nestjs/common';
import { AffirmationLoopController } from './affirmation-loop.controller';
import { AffirmationLoopService } from './affirmation-loop.service';
import { AudioMergeService } from './audio-merge.service';
import { AudioMergeProcessor } from './audio-merge.processor';
import { LoopReminderService } from './loop-reminder.service';
import { LoopTokenResetService } from './loop-token-reset.service';
import { DatabaseModule } from 'src/database/database.module';
import { StreakInterceptor } from 'src/common/interceptors/streak.interceptor';
import { StreakService } from 'src/common/services/streak.service';
import { StorageModule } from 'src/common/storage/storage.module';
import { StaterVideosModule } from 'src/stater-videos/stater-videos.module';
import { ReflectionModule } from 'src/reflection/reflection.module';

@Module({
    imports: [
        DatabaseModule,
        StorageModule,
        StaterVideosModule,
        ReflectionModule,
    ],
    controllers: [AffirmationLoopController],
    providers: [
        AffirmationLoopService,
        AudioMergeService,
        AudioMergeProcessor,
        LoopReminderService,
        LoopTokenResetService,
        StreakService,
        StreakInterceptor,
    ],
})
export class AffirmationLoopModule {}
