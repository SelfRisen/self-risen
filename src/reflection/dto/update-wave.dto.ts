import {
  IsOptional,
  IsInt,
  IsIn,
  Min,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWaveDto {
  @ApiProperty({
    description: 'Wave duration in days',
    example: 7,
    required: false,
    enum: [1, 3, 7, 14, 30],
  })
  @IsInt()
  @IsOptional()
  @IsIn([1, 3, 7, 14, 30])
  @Min(1)
  durationDays?: number;

  @ApiProperty({
    description: 'Whether the wave is active',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    description:
      'New start date for the wave (ISO 8601). Past dates are not allowed.',
    example: '2025-01-15T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
