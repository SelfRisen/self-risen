import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const HH_MM = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

export class CreateLoopReminderDto {
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

    @ApiProperty({
        description: 'IANA timezone for the reminder times',
        example: 'America/New_York',
        maxLength: 64,
    })
    @IsString()
    @MaxLength(64)
    timezone: string;
}
