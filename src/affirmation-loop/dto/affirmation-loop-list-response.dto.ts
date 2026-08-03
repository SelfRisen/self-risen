import { ApiProperty } from '@nestjs/swagger';
import { AffirmationLoopResponseDto } from './affirmation-loop-response.dto';
import { PaginationMetaDto } from './pagination-meta.dto';

export class AffirmationLoopListResponseDto {
  @ApiProperty({ type: [AffirmationLoopResponseDto] })
  data: AffirmationLoopResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination: PaginationMetaDto;
}
