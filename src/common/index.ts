import { Logger } from '@nestjs/common';
import { displayName } from '../../package.json';

export * as interfaces from './interfaces';
export * from './config';
export * from './guards';
export * from './interceptors/streak.interceptor';
export { BaseService } from './base.service';
export { BaseController } from './base.controller';
export {
  StorageService,
  FileType,
  UploadResult,
} from './storage/storage.service';
export { StorageModule } from './storage/storage.module';
export { CommonModule } from './common.module';

export const logger = new Logger(displayName);
