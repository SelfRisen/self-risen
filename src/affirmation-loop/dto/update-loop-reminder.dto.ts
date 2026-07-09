import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { HH_MM } from './create-loop-reminder.dto';

export class UpdateLoopReminderDto {
    @ApiPropertyOptional({
        description: 'Morning reminder time (HH:mm, 24h) in the given timezone',
        example: '07:00',
    })
    @IsOptional()
    @IsString()
    @Matches(HH_MM, { message: 'morningTime must be HH:mm (24h), e.g. 07:00' })
    morningTime?: string;

    @ApiPropertyOptional({
        description: 'Evening reminder time (HH:mm, 24h) in the given timezone',
        example: '21:30',
    })
    @IsOptional()
    @IsString()
    @Matches(HH_MM, { message: 'eveningTime must be HH:mm (24h), e.g. 21:30' })
    eveningTime?: string;

    @ApiPropertyOptional({
        description: 'IANA timezone for the reminder times',
        example: 'America/New_York',
        maxLength: 64,
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    timezone?: string;

    @ApiPropertyOptional({ description: 'Enable or disable this loop\'s reminders' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
