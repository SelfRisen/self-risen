import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';
import { auth } from 'firebase-admin';
import { BaseController, FirebaseUser, StreakInterceptor } from 'src/common';
import { AffirmationLoopService } from './affirmation-loop.service';
import {
    AffirmationLoopListResponseDto,
    AffirmationLoopResponseDto,
    CreateAffirmationLoopDto,
    DeleteAffirmationLoopResponseDto,
    LoopRemindersResponseDto,
    UpdateLoopRemindersDto,
} from './dto';

@UseGuards(FirebaseGuard)
@UseInterceptors(StreakInterceptor)
@ApiBearerAuth('firebase')
@ApiTags('Reflection')
@Controller('reflection/loops')
export class AffirmationLoopController extends BaseController {
    constructor(private readonly affirmationLoopService: AffirmationLoopService) {
        super();
    }

    @Post()
    @ApiOperation({
        summary: 'Create affirmation audio loop',
        description:
            'Merges the given affirmations with background music into a single MP3. Debits one loop token, enqueues a background merge job, and returns immediately with status PROCESSING and the requested durationSeconds. Poll GET /reflection/loops/:id until status is READY (audioUrl available) or FAILED (errorMessage, token refunded).',
    })
    @ApiBody({ type: CreateAffirmationLoopDto })
    @ApiResponse({
        status: 200,
        description: 'Loop created and merge job enqueued',
        type: AffirmationLoopResponseDto,
    })
    @ApiResponse({
        status: 400,
        description:
            'No loop tokens remaining, invalid background music key, affirmations not owned, empty affirmation text, or duplicate affirmation IDs',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async createLoop(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Body() dto: CreateAffirmationLoopDto,
    ) {
        const result = await this.affirmationLoopService.createLoop(user.uid, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation loop generation started',
            data: result.data,
        });
    }

    @Get()
    @ApiOperation({
        summary: 'List affirmation loops',
        description:
            'Returns a paginated list of affirmation loops for the current user, newest first. audioUrl is included only for loops with status READY.',
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
        description: 'Items per page (default: 10, max: 100)',
        example: 10,
    })
    @ApiResponse({
        status: 200,
        description: 'Affirmation loops retrieved successfully',
        type: AffirmationLoopListResponseDto,
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async listLoops(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        const result = await this.affirmationLoopService.listLoops(
            user.uid,
            page ? Number(page) : 1,
            limit ? Number(limit) : 10,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation loops retrieved',
            data: result.data,
        });
    }

    @Get('reminders')
    @ApiOperation({
        summary: 'Get loop reminder preferences',
        description:
            'Returns loop reminder settings. Empty loopReminderTimes means defaults (08:00 and 20:00 in the user timezone).',
    })
    @ApiResponse({
        status: 200,
        description: 'Loop reminder preferences retrieved',
        type: LoopRemindersResponseDto,
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getReminders(@FirebaseUser() user: auth.DecodedIdToken) {
        const result = await this.affirmationLoopService.getReminders(user.uid);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Loop reminder preferences retrieved',
            data: result.data,
        });
    }

    @Patch('reminders')
    @ApiOperation({
        summary: 'Update loop reminder schedule',
        description:
            'Set custom reminder times (HH:mm, 24-hour) in the user timezone. Pass an empty array to use defaults (08:00 and 20:00).',
    })
    @ApiBody({ type: UpdateLoopRemindersDto })
    @ApiResponse({
        status: 200,
        description: 'Loop reminders updated successfully',
        type: LoopRemindersResponseDto,
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async updateReminders(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Body() dto: UpdateLoopRemindersDto,
    ) {
        const result = await this.affirmationLoopService.updateReminders(
            user.uid,
            dto,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Loop reminders updated',
            data: result.data,
        });
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Get affirmation loop by ID',
        description:
            'Retrieves a single loop. Use to poll merge progress after POST: status PROCESSING until READY (signed audioUrl, durationSeconds) or FAILED (errorMessage).',
    })
    @ApiParam({
        name: 'id',
        description: 'Affirmation loop ID',
        example: '22c31e61-2308-4a3a-a36a-3cff5947cb74',
    })
    @ApiResponse({
        status: 200,
        description: 'Affirmation loop retrieved successfully',
        type: AffirmationLoopResponseDto,
    })
    @ApiResponse({ status: 404, description: 'User or affirmation loop not found' })
    async getLoop(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') id: string,
    ) {
        const result = await this.affirmationLoopService.getLoopById(user.uid, id);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation loop retrieved',
            data: result.data,
        });
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Delete affirmation loop',
        description:
            'Deletes the loop record and removes the merged MP3 from storage when present.',
    })
    @ApiParam({
        name: 'id',
        description: 'Affirmation loop ID',
        example: '22c31e61-2308-4a3a-a36a-3cff5947cb74',
    })
    @ApiResponse({
        status: 200,
        description: 'Affirmation loop deleted successfully',
        type: DeleteAffirmationLoopResponseDto,
    })
    @ApiResponse({ status: 404, description: 'User or affirmation loop not found' })
    async deleteLoop(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') id: string,
    ) {
        const result = await this.affirmationLoopService.deleteLoop(user.uid, id);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation loop deleted',
            data: result.data,
        });
    }
}
