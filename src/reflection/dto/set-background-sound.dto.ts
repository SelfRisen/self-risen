import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetBackgroundSoundDto {
  @ApiProperty({
    description:
      'ID of the background sound from the vision board sound catalog. Pass null to clear.',
    example: 'sound-id-123',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  soundId?: string | null;
}
