import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderVisionDto {
  @ApiProperty({
    description: 'The new order position (0-based)',
    example: 2,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  newOrder: number;
}

export class ReorderSoundDto {
  @ApiProperty({
    description: 'The new order position (0-based)',
    example: 2,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  newOrder: number;
}
