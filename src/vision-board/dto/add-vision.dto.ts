import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddVisionDto {
  @ApiProperty({
    description: 'The ID of the vision board to add the vision to (required)',
    example: 'vision-board-id-123',
    required: true,
  })
  @IsString()
  visionBoardId: string;

  @ApiProperty({
    description:
      'The ID of the reflection session to add to the vision board (optional)',
    example: 'reflection-session-id-123',
    required: false,
  })
  @IsString()
  @IsOptional()
  reflectionSessionId?: string;
}
