import { Module } from '@nestjs/common';
import { WheelOfLifeController } from './wheel-of-life.controller';
import { WheelOfLifeService } from './wheel-of-life.service';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [WheelOfLifeController],
  providers: [WheelOfLifeService],
  exports: [WheelOfLifeService],
})
export class WheelOfLifeModule {}
