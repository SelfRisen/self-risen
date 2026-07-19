import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FacebookSignInDto {
  @ApiProperty({
    required: true,
    description: 'Facebook access token obtained from Facebook Login',
  })
  @IsNotEmpty()
  @IsString()
  accessToken: string;
}
