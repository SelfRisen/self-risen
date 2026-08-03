import {
  Controller,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';
import { FirebaseUser } from 'src/common';
import { auth } from 'firebase-admin';
import { StorageService, FileType } from './storage.service';
import { UploadFileResponseDto, UploadFilesResponseDto } from './dto';

@ApiTags('Storage')
@UseGuards(FirebaseGuard)
@ApiBearerAuth('firebase')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload/image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a single image file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to upload (JPEG, PNG, GIF, WebP, SVG)',
        },
      },
      required: ['file'],
    },
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    type: String,
    description: 'Optional folder path to organize the uploaded file',
  })
  async uploadImage(
    @FirebaseUser() user: auth.DecodedIdToken,
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<{ message: string; data: UploadFileResponseDto }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const result = await this.storageService.uploadFile(
      file,
      FileType.IMAGE,
      user.uid,
      folder,
    );

    return {
      message: 'Image uploaded successfully',
      data: result,
    };
  }

  @Post('upload/images')
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload multiple image files' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description:
            'Image files to upload (max 10 files, JPEG, PNG, GIF, WebP, SVG)',
        },
      },
      required: ['files'],
    },
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    type: String,
    description: 'Optional folder path to organize the uploaded files',
  })
  async uploadImages(
    @FirebaseUser() user: auth.DecodedIdToken,
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder?: string,
  ): Promise<{ message: string; data: UploadFilesResponseDto }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const results = await this.storageService.uploadFiles(
      files,
      FileType.IMAGE,
      user.uid,
      folder,
    );

    return {
      message: `${results.length} image(s) uploaded successfully`,
      data: { files: results },
    };
  }

  @Post('upload/audio')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a single audio file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Audio file to upload (MP3, WAV, OGG, AAC, WebM, M4A)',
        },
      },
      required: ['file'],
    },
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    type: String,
    description: 'Optional folder path to organize the uploaded file',
  })
  async uploadAudio(
    @FirebaseUser() user: auth.DecodedIdToken,
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<{ message: string; data: UploadFileResponseDto }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const result = await this.storageService.uploadFile(
      file,
      FileType.AUDIO,
      user.uid,
      folder,
    );

    return {
      message: 'Audio uploaded successfully',
      data: result,
    };
  }

  @Post('upload/video')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a single video file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Video file to upload (MP4, MPEG, QuickTime, AVI, WebM, OGG)',
        },
      },
      required: ['file'],
    },
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    type: String,
    description: 'Optional folder path to organize the uploaded file',
  })
  async uploadVideo(
    @FirebaseUser() user: auth.DecodedIdToken,
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<{ message: string; data: UploadFileResponseDto }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const result = await this.storageService.uploadFile(
      file,
      FileType.VIDEO,
      user.uid,
      folder,
    );

    return {
      message: 'Video uploaded successfully',
      data: result,
    };
  }

  @Post('upload/mixed')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 10 },
      { name: 'audios', maxCount: 10 },
      { name: 'videos', maxCount: 10 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload mixed file types' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Image files to upload (max 10 files)',
        },
        audios: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Audio files to upload (max 10 files)',
        },
        videos: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Video files to upload (max 10 files)',
        },
      },
    },
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    type: String,
    description: 'Optional folder path to organize the uploaded files',
  })
  async uploadMixed(
    @FirebaseUser() user: auth.DecodedIdToken,
    @UploadedFiles()
    files: {
      images?: Express.Multer.File[];
      audios?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    },
    @Query('folder') folder?: string,
  ): Promise<{ message: string; data: any }> {
    const results: any = {};

    if (files.images && files.images.length > 0) {
      results.images = await this.storageService.uploadFiles(
        files.images,
        FileType.IMAGE,
        user.uid,
        folder,
      );
    }

    if (files.audios && files.audios.length > 0) {
      results.audios = await this.storageService.uploadFiles(
        files.audios,
        FileType.AUDIO,
        user.uid,
        folder,
      );
    }

    if (files.videos && files.videos.length > 0) {
      results.videos = await this.storageService.uploadFiles(
        files.videos,
        FileType.VIDEO,
        user.uid,
        folder,
      );
    }

    return {
      message: 'Files uploaded successfully',
      data: results,
    };
  }

  @Delete(':filePath')
  @ApiOperation({ summary: 'Delete a file from storage' })
  async deleteFile(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Param('filePath') filePath: string,
  ): Promise<{ message: string }> {
    // Decode the file path (it might be URL encoded)
    const decodedPath = decodeURIComponent(filePath);
    await this.storageService.deleteFile(decodedPath);

    return {
      message: 'File deleted successfully',
    };
  }
}
