import { IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateScoresDto {
  @ApiProperty({
    required: true,
    example: {
      'category-id-1': 8,
      'category-id-2': 6,
      'category-id-3': 7,
      'category-id-4': 5,
      'category-id-5': 9,
      'category-id-6': 4,
      'category-id-7': 7,
      'category-id-8': 6,
    },
    description: 'Object mapping category IDs to scores (1-10)',
  })
  @IsNotEmpty()
  @IsObject()
  scores: Record<string, number>; // { categoryId: score (1-10) }
}
