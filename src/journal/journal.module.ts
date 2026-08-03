import { Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { DatabaseModule } from 'src/database/database.module';
import { StorageModule } from 'src/common/storage/storage.module';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [CommonModule, DatabaseModule, StorageModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
