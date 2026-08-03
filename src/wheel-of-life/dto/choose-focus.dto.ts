import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChooseFocusDto {
  @ApiProperty({ required: true })
  @IsString()
  @IsNotEmpty()
  categoryId: string;
}
