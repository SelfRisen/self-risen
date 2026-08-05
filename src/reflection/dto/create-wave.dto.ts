import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsIn,
  Min,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWaveDto {
  @ApiProperty({
    description: 'The ID of the reflection session to create a wave for',
    example: 'session-id-123',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({
    description: 'Wave duration in days. Defaults to 7 if not provided.',
    example: 7,
    required: false,
    enum: [1, 3, 7, 14, 30],
  })
  @IsInt()
  @IsIn([1, 3, 7, 14, 30, 21, 60])
  @Min(1)
  durationDays: number;

  @ApiProperty({
    description:
      'Optional start date for the wave (ISO 8601). If omitted, the wave starts now. Past dates are not allowed.',
    example: '2025-01-15T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description:
      'Plays required to close a day: 1 for once daily, 2 for morning and evening. Fixed for the life of the wave. Defaults to 1.',
    example: 1,
    required: false,
    enum: [1, 2],
  })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  cadence?: number;

  @ApiProperty({
    description:
      'Local times to remind at while the day is still open, as 24-hour "HH:MM" strings.',
    example: ['08:00', '21:30'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    each: true,
    message: 'Each reminder time must be in 24-hour HH:MM format.',
  })
  reminderTimes?: string[];
}
