import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DatabaseProvider } from 'src/database/database.provider';
@Module({
  imports: [],
  controllers: [AuthController],
  providers: [AuthService, DatabaseProvider],
})
export class AuthModule {}
