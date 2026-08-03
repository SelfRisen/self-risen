import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyPasswordResetOtpDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ required: true, description: '4-digit OTP code' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'OTP must be exactly 4 digits' })
  otp: string;
}
