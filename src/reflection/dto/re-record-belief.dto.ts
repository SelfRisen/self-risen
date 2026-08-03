import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReRecordBeliefDto {
  @ApiProperty({
    description:
      "Text input of the user's belief. Optional if audio file is provided.",
    example: 'Money is stressful and scarce.',
    required: false,
  })
  @IsString()
  @IsOptional()
  text?: string;
}
