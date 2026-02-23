import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiBody,
    ApiParam,
    ApiQuery,
    ApiConsumes,
    ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';
import { FirebaseUser, StreakInterceptor } from 'src/common';
import { auth } from 'firebase-admin';
import { BaseController } from 'src/common';
import { VisionBoardService } from './vision-board.service';
import { AddVisionDto, AddVisionToGlobalBoardDto, UpdateVisionDto, SetVisionSoundDto, ReorderVisionDto, ReorderSoundDto } from './dto';

@UseGuards(FirebaseGuard)
@UseInterceptors(StreakInterceptor)
@ApiBearerAuth('firebase')
@ApiTags('Vision Board')
@Controller('vision-board')
export class VisionBoardController extends BaseController {
    constructor(private readonly visionBoardService: VisionBoardService) {
        super();
    }

    @Post('visions')
    @UseInterceptors(FileInterceptor('image'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Add a vision to vision board',
        description: 'Adds a vision to the vision board. Can include a reflection session (must be in AFFIRMATION_GENERATED status) and/or an image. Both are optional.',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                visionBoardId: {
                    type: 'string',
                    description: 'The ID of the vision board to add the vision to (required)',
                    example: 'vision-board-id-123',
                },
                reflectionSessionId: {
                    type: 'string',
                    description: 'The ID of the reflection session to add (optional)',
                    example: 'reflection-session-id-123',
                },
                image: {
                    type: 'string',
                    format: 'binary',
                    description: 'Image file to display with the vision (optional)',
                },
            },
            required: ['visionBoardId'],
        },
    })
    @ApiResponse({
        status: 201,
        description: 'Vision added successfully',
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request or reflection session not in AFFIRMATION_GENERATED status (if provided)',
    })
    @ApiResponse({
        status: 404,
        description: 'User or reflection session not found',
    })
    async addVision(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Body() dto: AddVisionDto,
        @UploadedFile() imageFile?: Express.Multer.File,
    ) {
        const result = await this.visionBoardService.addVision(
            user.uid,
            dto.visionBoardId,
            dto.reflectionSessionId,
            imageFile,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Vision added successfully',
            data: result.data,
        });
    }

    @Post('visions/global')
    @ApiOperation({
        summary: 'Duplicate a vision onto the global vision board',
        description: 'Creates a copy of an existing vision (same image and background sound) on the user\'s global vision board. The source vision must belong to the user. Reflection session is not copied (one session can only link to one vision).',
    })
    @ApiBody({ type: AddVisionToGlobalBoardDto })
    @ApiResponse({
        status: 201,
        description: 'Vision duplicated to global board successfully',
    })
    @ApiResponse({
        status: 404,
        description: 'User, vision board, or source vision not found',
    })
    async addVisionToGlobalBoard(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Body() dto: AddVisionToGlobalBoardDto,
    ) {
        const result = await this.visionBoardService.addVisionToGlobalBoard(user.uid, dto.visionId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Vision added to global board successfully',
            data: result.data,
        });
    }

    @Get('visions')
    @ApiOperation({
        summary: 'Get all visions for user\'s vision board',
        description: 'Retrieves a paginated list of all visions in the user\'s vision board. Can be filtered by visionBoardId.',
    })
    @ApiQuery({
        name: 'page',
        required: false,
        type: Number,
        description: 'Page number (default: 1)',
        example: 1,
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of items per page (default: 10, max: 100)',
        example: 10,
    })
    @ApiQuery({
        name: 'visionBoardId',
        required: false,
        type: String,
        description: 'Filter visions by vision board ID (optional - if not provided, returns visions from all user\'s vision boards)',
        example: 'vision-board-id-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Visions retrieved successfully',
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    async getAllVisions(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('visionBoardId') visionBoardId?: string,
    ) {
        const pageNumber = page ? parseInt(page, 10) : 1;
        const limitNumber = limit ? parseInt(limit, 10) : 10;

        const result = await this.visionBoardService.getAllVisions(
            user.uid,
            pageNumber,
            limitNumber,
            visionBoardId,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Visions retrieved successfully',
            data: result.data,
        });
    }

    @Get('visions/:id')
    @ApiOperation({
        summary: 'Get single vision by ID',
        description: 'Retrieves a single vision from the vision board by its ID.',
    })
    @ApiParam({
        name: 'id',
        description: 'The unique identifier of the vision',
        example: 'vision-id-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Vision retrieved successfully',
    })
    @ApiResponse({
        status: 404,
        description: 'Vision not found',
    })
    async getVisionById(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') visionId: string,
    ) {
        const result = await this.visionBoardService.getVisionById(user.uid, visionId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Vision retrieved successfully',
            data: result.data,
        });
    }

    @Patch('visions/:id')
    @UseInterceptors(FileInterceptor('image'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Update a vision',
        description: 'Updates a vision in the vision board. Can update the image and/or link a reflection session. Both are optional.',
    })
    @ApiParam({
        name: 'id',
        description: 'The unique identifier of the vision',
        example: 'vision-id-123',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                reflectionSessionId: {
                    type: 'string',
                    description: 'The ID of the reflection session to link to the vision (optional)',
                    example: 'reflection-session-id-123',
                },
                visionSoundId: {
                    type: 'string',
                    nullable: true,
                    description: 'ID of the vision sound from the catalog. Pass null to clear (optional)',
                    example: 'sound-id-123',
                },
                image: {
                    type: 'string',
                    format: 'binary',
                    description: 'Image file to display with the vision (optional)',
                },
            },
            required: [],
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Vision updated successfully',
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request, failed to upload image, or reflection session validation failed',
    })
    @ApiResponse({
        status: 404,
        description: 'Vision or reflection session not found',
    })
    async updateVision(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') visionId: string,
        @Body() dto: UpdateVisionDto,
        @UploadedFile() imageFile?: Express.Multer.File,
    ) {
        const result = await this.visionBoardService.updateVision(
            user.uid,
            visionId,
            dto.reflectionSessionId,
            imageFile,
            dto.visionSoundId,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Vision updated successfully',
            data: result.data,
        });
    }

    @Patch('visions/:id/background-sound')
    @ApiOperation({
        summary: 'Set vision background sound by name',
        description: 'Selects a sound from the stater-videos music list by name and sets it as the vision\'s background sound. Creates a catalog entry if needed.',
    })
    @ApiParam({
        name: 'id',
        description: 'The unique identifier of the vision',
        example: 'vision-id-123',
    })
    @ApiBody({ type: SetVisionSoundDto })
    @ApiResponse({ status: 200, description: 'Vision updated with background sound' })
    @ApiResponse({ status: 404, description: 'Vision not found or sound name not found' })
    async setVisionBackgroundSound(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') visionId: string,
        @Body() dto: SetVisionSoundDto,
    ) {
        const result = await this.visionBoardService.setVisionBackgroundSoundByName(user.uid, visionId, dto.name);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Background sound set successfully',
            data: result.data,
        });
    }

    @Delete('visions/:id')
    @ApiOperation({
        summary: 'Remove vision from board',
        description: 'Removes a vision from the user\'s vision board.',
    })
    @ApiParam({
        name: 'id',
        description: 'The unique identifier of the vision to remove',
        example: 'vision-id-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Vision removed successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Vision not found',
    })
    async removeVision(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') visionId: string,
    ) {
        const result = await this.visionBoardService.removeVision(user.uid, visionId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Vision removed successfully',
            data: result.data,
        });
    }

    // @Post('sounds')
    // @UseInterceptors(FilesInterceptor('sounds', 10))
    // @ApiConsumes('multipart/form-data')
    // @ApiOperation({
    //     summary: 'Upload multiple audio files for vision board',
    //     description: 'Uploads one or more audio files to be used with the vision board. Supports multiple file uploads (max 10 files per request).',
    // })
    // @ApiBody({
    //     schema: {
    //         type: 'object',
    //         properties: {
    //             sounds: {
    //                 type: 'array',
    //                 items: {
    //                     type: 'string',
    //                     format: 'binary',
    //                 },
    //                 description: 'Audio files to upload (max 10 files). Supported formats: MP3, WAV, OGG, AAC, M4A, WebM',
    //             },
    //         },
    //         required: ['sounds'],
    //     },
    // })
    // @ApiResponse({
    //     status: 200,
    //     description: 'Audio files uploaded successfully',
    //     schema: {
    //         type: 'object',
    //         properties: {
    //             uploaded: { type: 'number', description: 'Number of files successfully uploaded' },
    //             files: {
    //                 type: 'array',
    //                 items: {
    //                     type: 'object',
    //                     properties: {
    //                         id: { type: 'string' },
    //                         soundUrl: { type: 'string' },
    //                         name: { type: 'string', nullable: true },
    //                         fileSize: { type: 'number', nullable: true },
    //                         mimeType: { type: 'string', nullable: true },
    //                         order: { type: 'number', nullable: true },
    //                         createdAt: { type: 'string', format: 'date-time' },
    //                         updatedAt: { type: 'string', format: 'date-time' },
    //                     },
    //                 },
    //             },
    //         },
    //     },
    // })
    // @ApiResponse({
    //     status: 400,
    //     description: 'Invalid request or failed to upload audio files',
    // })
    // @ApiResponse({
    //     status: 404,
    //     description: 'User not found',
    // })
    // async uploadSound(
    //     @FirebaseUser() user: auth.DecodedIdToken,
    //     @UploadedFiles() soundFiles?: Express.Multer.File[],
    // ) {
    //     if (!soundFiles || soundFiles.length === 0) {
    //         throw new BadRequestException('At least one audio file is required');
    //     }

    //     const result = await this.visionBoardService.uploadSound(user.uid, soundFiles);
    //     if (result.isError) throw result.error;

    //     return this.response({
    //         message: 'Audio files uploaded successfully',
    //         data: result.data,
    //     });
    // }

    @Get('sounds')
    @ApiOperation({
        summary: 'Get all sounds',
        description: 'Retrieves all sounds (catalog used for both visions and reflections), ordered by display order.',
    })
    @ApiResponse({
        status: 200,
        description: 'Audio files retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Total number of audio files' },
                files: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            soundUrl: { type: 'string' },
                            name: { type: 'string', nullable: true },
                            fileSize: { type: 'number', nullable: true },
                            mimeType: { type: 'string', nullable: true },
                            order: { type: 'number', nullable: true },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' },
                        },
                    },
                },
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    async getSounds(@FirebaseUser() user: auth.DecodedIdToken) {
        const result = await this.visionBoardService.getSounds(user.uid);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Sounds retrieved successfully',
            data: result.data,
        });
    }

    @Get('visions/:id/sounds')
    @ApiOperation({
        summary: 'Get sounds in context of a vision',
        description: 'Returns all sounds plus the vision\'s selected background sound (for picker + current selection).',
    })
    @ApiParam({ name: 'id', description: 'Vision ID', example: 'vision-id-123' })
    @ApiResponse({ status: 200, description: 'Sounds and vision background sound' })
    @ApiResponse({ status: 404, description: 'User or vision not found' })
    async getSoundsForVision(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') visionId: string,
    ) {
        const result = await this.visionBoardService.getSoundsForVision(user.uid, visionId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Sounds retrieved successfully',
            data: result.data,
        });
    }

    @Patch('visions/:id/reorder')
    @ApiOperation({
        summary: 'Reorder a vision within its vision board',
        description: 'Changes the order of a vision within its vision board. Other visions are shifted accordingly.',
    })
    @ApiParam({
        name: 'id',
        description: 'The unique identifier of the vision to reorder',
        example: 'vision-id-123',
    })
    @ApiBody({ type: ReorderVisionDto })
    @ApiResponse({
        status: 200,
        description: 'Vision reordered successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
                visions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            order: { type: 'number' },
                        },
                    },
                },
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Vision not found',
    })
    async reorderVision(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') visionId: string,
        @Body() dto: ReorderVisionDto,
    ) {
        const result = await this.visionBoardService.reorderVision(
            user.uid,
            visionId,
            dto.newOrder,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Vision reordered successfully',
            data: result.data,
        });
    }

    @Patch('sounds/:id/reorder')
    @ApiOperation({
        summary: 'Reorder a sound',
        description: 'Changes the order of a sound. Other sounds are shifted accordingly.',
    })
    @ApiParam({
        name: 'id',
        description: 'The unique identifier of the sound to reorder',
        example: 'sound-id-123',
    })
    @ApiBody({ type: ReorderSoundDto })
    @ApiResponse({
        status: 200,
        description: 'Sound reordered successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
                sounds: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            order: { type: 'number' },
                            name: { type: 'string', nullable: true },
                        },
                    },
                },
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Sound not found',
    })
    async reorderSound(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') soundId: string,
        @Body() dto: ReorderSoundDto,
    ) {
        const result = await this.visionBoardService.reorderSound(
            user.uid,
            soundId,
            dto.newOrder,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Sound reordered successfully',
            data: result.data,
        });
    }

    @Get('boards')
    @ApiOperation({
        summary: 'Get all vision boards for user',
        description: 'Retrieves all vision boards for the authenticated user, including associated category information and vision counts.',
    })
    @ApiResponse({
        status: 200,
        description: 'Vision boards retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Total number of vision boards' },
                boards: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'Vision board ID' },
                            categoryId: { type: 'string', description: 'Associated category ID' },
                            category: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    name: { type: 'string' },
                                    order: { type: 'number' },
                                },
                            },
                            visionCount: { type: 'number', description: 'Number of visions in this board' },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' },
                        },
                    },
                },
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    async getAllVisionBoards(@FirebaseUser() user: auth.DecodedIdToken) {
        const result = await this.visionBoardService.getAllVisionBoards(user.uid);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Vision boards retrieved successfully',
            data: result.data,
        });
    }
}

