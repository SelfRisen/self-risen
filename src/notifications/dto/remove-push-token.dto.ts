import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class RemovePushTokenDto {
  @ApiProperty({
    description: 'Push token to remove',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Push token is too short' })
  @MaxLength(500, { message: 'Push token is too long' })
  pushToken: string;
}
