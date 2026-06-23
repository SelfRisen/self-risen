import { Module } from '@nestjs/common';
import { StorageModule } from 'src/common';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';
import { StaterVideosController } from './stater-videos.controller';
import { StaterVideosService } from './stater-videos.service';

@Module({
  imports: [StorageModule],
  controllers: [StaterVideosController],
  providers: [StaterVideosService, TextToSpeechService],
  exports: [StaterVideosService],
})
export class StaterVideosModule {}
