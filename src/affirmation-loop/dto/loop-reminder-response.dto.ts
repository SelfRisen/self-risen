import { ApiProperty } from '@nestjs/swagger';

export class LoopReminderResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    loopId: string;

    @ApiProperty({ nullable: true, example: '07:00' })
    morningTime: string | null;

    @ApiProperty({ nullable: true, example: '21:30' })
    eveningTime: string | null;

    @ApiProperty({ example: 'America/New_York' })
    timezone: string;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}
