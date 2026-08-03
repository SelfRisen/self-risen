import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { SupabaseStorageService } from './supabase-storage.service';
import { CompressionService } from './compression.service';

@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  providers: [
    CompressionService,
    {
      provide: SupabaseStorageService,
      useFactory: (compressionService: CompressionService) => {
        // Always create SupabaseStorageService, but it won't validate config
        // until it's actually used (when provider is Supabase)
        return new SupabaseStorageService(compressionService);
      },
      inject: [CompressionService],
    },
    {
      provide: StorageService,
      useFactory: (
        supabaseService: SupabaseStorageService,
        compressionService: CompressionService,
      ) => {
        return new StorageService(supabaseService, compressionService);
      },
      inject: [SupabaseStorageService, CompressionService],
    },
  ],
  exports: [StorageService, SupabaseStorageService],
})
export class StorageModule {}
