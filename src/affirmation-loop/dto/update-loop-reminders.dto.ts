import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const HH_MM = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

export class UpdateLoopRemindersDto {
    @ApiPropertyOptional({ description: 'Enable or disable affirmation loop reminders' })
    @IsOptional()
    @IsBoolean()
    loopReminderEnabled?: boolean;

    @ApiPropertyOptional({
        description:
            'Reminder times (HH:mm, 24h) in the user timezone. Empty array uses defaults (08:00 and 20:00).',
        example: ['07:30', '12:00', '21:00'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Matches(HH_MM, { each: true, message: 'Each time must be HH:mm (24h), e.g. 08:00 or 14:30' })
    loopReminderTimes?: string[];

    @ApiPropertyOptional({
        description: 'IANA timezone for reminder times (e.g. America/New_York)',
        example: 'America/New_York',
        maxLength: 64,
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    timezone?: string;
}
