import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
} from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({
    description: 'Firebase ID of the user to send notification to',
    example: 'firebaseUid123',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128, { message: 'Firebase ID is too long' })
  firebaseId: string;

  @ApiProperty({
    description: 'Notification title',
    example: 'New Message',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Title must not exceed 100 characters' })
  title: string;

  @ApiProperty({
    description: 'Notification body',
    example: 'You have received a new message',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'Body must not exceed 500 characters' })
  body: string;

  @ApiProperty({
    description: 'Additional data payload',
    required: false,
    example: { orderId: '123', type: 'order' },
  })
  @IsObject()
  @IsOptional()
  data?: Record<string, string>;
}
