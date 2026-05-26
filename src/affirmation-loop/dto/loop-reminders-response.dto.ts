import { ApiProperty } from '@nestjs/swagger';

export class LoopRemindersResponseDto {
    @ApiProperty({ description: 'Whether affirmation loop reminders are enabled' })
    loopReminderEnabled: boolean;

    @ApiProperty({
        description:
            'Custom reminder times (HH:mm in user timezone). Empty means defaults (08:00 and 20:00).',
        example: ['07:30', '21:00'],
        type: [String],
    })
    loopReminderTimes: string[];

    @ApiProperty({
        description: 'Default times used when loopReminderTimes is empty',
        example: ['08:00', '20:00'],
        type: [String],
    })
    defaultLoopReminderTimes: string[];

    @ApiProperty({
        description: 'IANA timezone for reminder times',
        example: 'America/New_York',
    })
    timezone: string;
}
