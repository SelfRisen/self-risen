import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StreakCalendarQueryDto {
  @ApiProperty({
    description: 'Year for the calendar view',
    example: 2024,
    minimum: 2020,
    maximum: 2100,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @ApiProperty({
    description: 'Month for the calendar view (1-12)',
    example: 1,
    minimum: 1,
    maximum: 12,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class StreakChartQueryDto {
  @ApiPropertyOptional({
    description: 'Year for the chart view (defaults to current year)',
    example: 2024,
    minimum: 2020,
    maximum: 2100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}

export interface StreakCalendarDay {
  date: string;
  dayOfMonth: number;
  streak: number;
}

export interface StreakCalendarResponse {
  year: number;
  month: number;
  totalActiveDays: number;
  days: StreakCalendarDay[];
}

export interface StreakChartMonth {
  month: string;
  monthNumber: number;
  streakDays: number;
}

export interface StreakChartResponse {
  year: number;
  totalStreakDays: number;
  months: StreakChartMonth[];
}
