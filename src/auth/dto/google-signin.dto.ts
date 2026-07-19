import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleSignInDto {
  @ApiProperty({
    required: true,
    description: 'Google ID token obtained from Google Sign-In',
  })
  @IsNotEmpty()
  @IsString()
  idToken: string;
}
