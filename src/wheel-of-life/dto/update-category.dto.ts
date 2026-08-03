import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({ required: true })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: true })
  @IsNumber()
  @IsOptional()
  order?: number;
}
