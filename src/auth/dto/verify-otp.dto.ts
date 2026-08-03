import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    required: true,
    description: 'Firebase ID token received after OTP verification',
  })
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({
    required: false,
    description: 'User name (only needed for new signups)',
  })
  @IsString()
  name?: string;
}
