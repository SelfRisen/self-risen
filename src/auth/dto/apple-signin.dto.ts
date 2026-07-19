import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AppleSignInDto {
  @ApiProperty({
    required: true,
    description: 'Apple identity token (JWT) obtained from Apple Sign-In',
  })
  @IsNotEmpty()
  @IsString()
  idToken: string;
}
