import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

export class SendBulkNotificationDto {
  @ApiProperty({
    description: 'Array of Firebase IDs of users to send notification to',
    example: ['firebaseUid123', 'firebaseUid456'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one Firebase ID is required' })
  @ArrayMaxSize(1000, {
    message: 'Cannot send to more than 1000 users at once',
  })
  @IsString({ each: true })
  @MaxLength(128, { each: true, message: 'Firebase ID is too long' })
  @IsNotEmpty()
  firebaseIds: string[];

  @ApiProperty({
    description: 'Notification title',
    example: 'System Announcement',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Title must not exceed 100 characters' })
  title: string;

  @ApiProperty({
    description: 'Notification body',
    example: 'Important system update',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'Body must not exceed 500 characters' })
  body: string;

  @ApiProperty({
    description: 'Additional data payload',
    required: false,
    example: { type: 'announcement', category: 'system' },
  })
  @IsObject()
  @IsOptional()
  data?: Record<string, string>;
}
