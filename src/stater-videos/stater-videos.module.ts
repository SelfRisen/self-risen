import { Module } from '@nestjs/common';
import { StaterVideosController } from './stater-videos.controller';
import { StaterVideosService } from './stater-videos.service';

@Module({
  controllers: [StaterVideosController],
  providers: [StaterVideosService],
  exports: [StaterVideosService],
})
export class StaterVideosModule {}
