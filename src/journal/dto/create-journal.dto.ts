import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateJournalDto {
  @ApiProperty({
    description: 'The title of the journal entry',
    example: 'My First Journal Entry',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'The text content of the journal entry',
    example: 'Today was a great day...',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiPropertyOptional({
    description:
      'The date of the journal entry (ISO string). Defaults to now if not provided.',
    example: '2024-01-15T10:30:00Z',
  })
  @IsDateString()
  @IsOptional()
  date?: string;
}
