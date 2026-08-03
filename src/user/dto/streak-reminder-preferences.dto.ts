import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsArray,
  Matches,
  MaxLength,
} from 'class-validator';

const HH_MM = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

export class StreakReminderPreferencesResponseDto {
  @ApiProperty({
    description: 'Whether streak reminders are enabled',
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    description:
      'Times of day to send reminders (HH:mm in user timezone). Empty means use defaults (08:00 and 18:00 UTC).',
    example: ['08:00', '14:00', '20:00'],
    type: [String],
  })
  times: string[];

  @ApiProperty({
    description:
      'IANA timezone for custom times (e.g. America/New_York). Ignored when times is empty.',
    example: 'America/New_York',
  })
  timezone: string;
}

export class UpdateStreakReminderPreferencesDto {
  @ApiPropertyOptional({
    description: 'Enable or disable streak reminders',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Times of day to send reminders (HH:mm, 24h). Empty array means use defaults (08:00 and 18:00 UTC).',
    example: ['08:00', '14:00', '20:00'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(HH_MM, {
    each: true,
    message: 'Each time must be HH:mm (24h), e.g. 08:00 or 14:30',
  })
  times?: string[];

  @ApiPropertyOptional({
    description:
      'IANA timezone (e.g. America/New_York). Used only when times is set.',
    example: 'America/New_York',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
