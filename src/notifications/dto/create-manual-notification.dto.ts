import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { NotificationChannelTypeEnum } from '../enums/notification.enum';

export class CreateManualNotificationDto {
  @ApiProperty({
    description: 'Firebase UID of the recipient user',
    example: 'firebaseUid123',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128, { message: 'Recipient Firebase ID is too long' })
  recipientFirebaseId: string;

  @ApiProperty({
    description: 'Notification title',
    example: 'Reminder',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title: string;

  @ApiProperty({
    description: 'Notification body',
    example: 'This is a manual notification.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'Body must not exceed 2000 characters' })
  body: string;

  @ApiPropertyOptional({
    description: 'Channels to send to (default: IN_APP only)',
    enum: NotificationChannelTypeEnum,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannelTypeEnum, { each: true })
  channels?: NotificationChannelTypeEnum[];

  @ApiPropertyOptional({
    description:
      'Idempotency key; if provided and duplicate, returns existing result',
    example: 'manual-notif-abc-123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata (e.g. deepLink, resourceId)',
    example: { deepLink: '/settings', resourceId: '123' },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, string>;
}
