import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MAX_LOOP_DURATION_SECONDS } from '../audio-merge.service';

export class UpdateAffirmationLoopDto {
  @ApiPropertyOptional({
    description: 'Loop name',
    example: 'My Loop',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Loop description',
    example: 'This is a loop description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Background music name from GET /stater-videos/music (must match a list item name exactly)',
    example: 'meditation',
  })
  @IsString()
  @IsOptional()
  backgroundMusicKey: string;

  @ApiPropertyOptional({
    description:
      'Target loop duration in seconds (1–900). The merged audio is capped at this length.',
    example: 180,
    minimum: 1,
    maximum: MAX_LOOP_DURATION_SECONDS,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_LOOP_DURATION_SECONDS)
  durationSeconds: number;
}
