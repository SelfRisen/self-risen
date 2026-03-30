import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionDto {
    @ApiProperty({
        description: 'The ID of the Wheel of Life category to reflect on. If omitted, a global session (no category) is created.',
        example: 'cat-id-123',
        required: false,
    })
    @IsString()
    @IsOptional()
    categoryId?: string;
}
