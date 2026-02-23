import { Module } from '@nestjs/common';
import { VisionBoardController } from './vision-board.controller';
import { VisionBoardService } from './vision-board.service';
import { DatabaseModule } from 'src/database/database.module';
import { StorageModule } from 'src/common/storage/storage.module';
import { CommonModule } from 'src/common/common.module';
import { StaterVideosModule } from 'src/stater-videos/stater-videos.module';

@Module({
    imports: [
        CommonModule,
        DatabaseModule,
        StorageModule,
        StaterVideosModule,
    ],
    controllers: [VisionBoardController],
    providers: [VisionBoardService],
    exports: [VisionBoardService],
})
export class VisionBoardModule { }

