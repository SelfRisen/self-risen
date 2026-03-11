import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVisionBoardForCategoryDto {
    @ApiProperty({
        description: 'The ID of the Wheel of Life category to create a vision board for',
        example: 'category-id-123',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    categoryId: string;
}
