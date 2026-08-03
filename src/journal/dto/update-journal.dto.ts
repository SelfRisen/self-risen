import {
  IsString,
  IsOptional,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateJournalDto {
  @ApiPropertyOptional({
    description:
      'The title of the journal entry. Empty values will not update the field.',
    example: 'Updated Journal Title',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description:
      'The text content of the journal entry. Empty values will not update the field.',
    example: 'Updated journal content...',
  })
  @IsString()
  @IsOptional()
  text?: string;

  @ApiPropertyOptional({
    description:
      'The date of the journal entry (ISO string). Empty values will not update the field.',
    example: '2024-01-15T10:30:00Z',
  })
  @ValidateIf((o) => o.date !== undefined && o.date !== null && o.date !== '')
  @IsDateString()
  @IsOptional()
  date?: string;
}
