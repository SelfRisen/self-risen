import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateVisionDto {
  @ApiProperty({
    description:
      'The ID of the reflection session to link to the vision (optional)',
    example: 'reflection-session-id-123',
    required: false,
  })
  @IsString()
  @IsOptional()
  reflectionSessionId?: string;

  @ApiProperty({
    description:
      'ID of the vision sound from the catalog. Pass null to clear (optional)',
    example: 'sound-id-123',
    nullable: true,
    required: false,
  })
  @IsString()
  @IsOptional()
  visionSoundId?: string | null;
}
