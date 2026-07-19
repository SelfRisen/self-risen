import { ApiProperty } from '@nestjs/swagger';

export class UploadFileResponseDto {
  @ApiProperty()
  url: string;

  @ApiProperty()
  path: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  contentType: string;

  @ApiProperty()
  size: number;
}

export class UploadFilesResponseDto {
  @ApiProperty({ type: [UploadFileResponseDto] })
  files: UploadFileResponseDto[];
}
