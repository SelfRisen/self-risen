import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EditBeliefDto {
  @ApiProperty({
    description:
      'The edited belief text (replaces the stored belief). Affirmation is unchanged.',
    example: 'Money feels stressful and scarce to me.',
    required: true,
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  belief: string;
}
