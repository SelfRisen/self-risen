import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ required: true, description: 'Firebase refresh token' })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
