import { ApiProperty } from '@nestjs/swagger';

export class DeleteAffirmationLoopResponseDto {
  @ApiProperty({ example: true })
  deleted: boolean;

  @ApiProperty({ example: '22c31e61-2308-4a3a-a36a-3cff5947cb74' })
  id: string;
}
