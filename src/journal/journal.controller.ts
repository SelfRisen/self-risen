import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';
import { FirebaseUser } from 'src/common';
import { auth } from 'firebase-admin';
import { BaseController } from 'src/common';
import { JournalService } from './journal.service';
import { CreateJournalDto, UpdateJournalDto } from './dto';

@UseGuards(FirebaseGuard)
@ApiBearerAuth('firebase')
@ApiTags('Journal')
@Controller('journal')
export class JournalController extends BaseController {
  constructor(private readonly journalService: JournalService) {
    super();
  }

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create a new journal entry',
    description:
      'Creates a new journal entry with title, text, optional date, and optional image. Date defaults to now if not provided.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the journal entry',
          example: 'My First Journal Entry',
        },
        text: {
          type: 'string',
          description: 'The text content of the journal entry',
          example: 'Today was a great day...',
        },
        date: {
          type: 'string',
          format: 'date-time',
          description:
            'The date of the journal entry (ISO string). Defaults to now if not provided.',
          example: '2024-01-15T10:30:00Z',
        },
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file for the journal entry (optional)',
        },
      },
      required: ['title', 'text'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Journal entry created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async createJournal(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Body() dto: CreateJournalDto,
    @UploadedFile() imageFile?: Express.Multer.File,
  ) {
    const result = await this.journalService.createJournal(
      user.uid,
      dto,
      imageFile,
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Journal entry created successfully',
      data: result.data,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'Get all journal entries',
    description:
      'Retrieves a paginated list of all journal entries for the authenticated user, ordered by date (newest first).',
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
    name: 'search',
    required: false,
    type: String,
    description: 'Search term to filter journals by title (case-insensitive)',
    example: 'My Journal',
  })
  @ApiResponse({
    status: 200,
    description: 'Journal entries retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getAllJournals(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;

    const result = await this.journalService.getAllJournals(
      user.uid,
      pageNumber,
      limitNumber,
      search,
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Journal entries retrieved successfully',
      data: result.data,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a journal entry by ID',
    description: 'Retrieves a single journal entry by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the journal entry',
    example: 'journal-id-123',
  })
  @ApiResponse({
    status: 200,
    description: 'Journal entry retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Journal entry or user not found',
  })
  async getJournalById(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Param('id') journalId: string,
  ) {
    const result = await this.journalService.getJournalById(
      user.uid,
      journalId,
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Journal entry retrieved successfully',
      data: result.data,
    });
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update a journal entry',
    description: 'Updates an existing journal entry. All fields are optional.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the journal entry to update',
    example: 'journal-id-123',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the journal entry',
          example: 'Updated Journal Title',
        },
        text: {
          type: 'string',
          description: 'The text content of the journal entry',
          example: 'Updated journal content...',
        },
        date: {
          type: 'string',
          format: 'date-time',
          description: 'The date of the journal entry (ISO string)',
          example: '2024-01-15T10:30:00Z',
        },
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file for the journal entry (optional)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Journal entry updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request',
  })
  @ApiResponse({
    status: 404,
    description: 'Journal entry or user not found',
  })
  async updateJournal(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Param('id') journalId: string,
    @Body() dto: UpdateJournalDto,
    @UploadedFile() imageFile?: Express.Multer.File,
  ) {
    const result = await this.journalService.updateJournal(
      user.uid,
      journalId,
      dto,
      imageFile,
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Journal entry updated successfully',
      data: result.data,
    });
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a journal entry',
    description: 'Deletes a journal entry by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the journal entry to delete',
    example: 'journal-id-123',
  })
  @ApiResponse({
    status: 200,
    description: 'Journal entry deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Journal entry or user not found',
  })
  async deleteJournal(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Param('id') journalId: string,
  ) {
    const result = await this.journalService.deleteJournal(user.uid, journalId);
    if (result.isError) throw result.error;

    return this.response({
      message: 'Journal entry deleted successfully',
      data: result.data,
    });
  }
}
