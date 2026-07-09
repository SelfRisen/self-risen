import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
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
    CreateLoopReminderDto,
    DeleteAffirmationLoopResponseDto,
    LoopReminderResponseDto,
    UpdateAffirmationLoopDto,
    UpdateLoopReminderDto,
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
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({
        summary: 'Create affirmation audio loop',
        description:
            'Merges the given affirmations with background music into a single MP3. Debits one loop token, enqueues a background merge job, and returns immediately with status PROCESSING and the requested durationSeconds. Poll GET /reflection/loops/:id until status is READY (audioUrl available) or FAILED (errorMessage, token refunded).',
    })
    @ApiBody({ type: CreateAffirmationLoopDto })
    @ApiResponse({
        status: 202,
        description: 'Loop created and merge job enqueued',
        type: AffirmationLoopResponseDto,
    })
    @ApiResponse({
        status: 400,
        description:
            'Invalid background music key, affirmations not owned, empty affirmation text, or duplicate affirmation IDs',
    })
    @ApiResponse({ status: 402, description: 'No loop tokens remaining' })
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

    @Patch(':id')
    @ApiOperation({
        summary: 'Update affirmation loop',
        description: 'Updates an affirmation loop',
    })
    @ApiBody({ type: UpdateAffirmationLoopDto })
    @ApiResponse({ status: 200, description: 'Affirmation loop updated successfully', type: AffirmationLoopResponseDto })
    @ApiResponse({ status: 404, description: 'User or affirmation loop not found' })
    async updateLoop(@FirebaseUser() user: auth.DecodedIdToken, @Param('id') id: string, @Body() dto: UpdateAffirmationLoopDto) {
        const result = await this.affirmationLoopService.updateLoop(user.uid, id, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation loop updated',
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

    @Post(':id/reminder')
    @ApiOperation({
        summary: 'Set AM/PM reminders for a loop',
        description:
            'Creates (or replaces) the reminder schedule for this loop. At least one of morningTime or eveningTime is required.',
    })
    @ApiParam({ name: 'id', description: 'Affirmation loop ID' })
    @ApiBody({ type: CreateLoopReminderDto })
    @ApiResponse({ status: 201, description: 'Reminder set', type: LoopReminderResponseDto })
    @ApiResponse({ status: 400, description: 'Neither morningTime nor eveningTime provided' })
    @ApiResponse({ status: 404, description: 'User or affirmation loop not found' })
    async setReminder(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') id: string,
        @Body() dto: CreateLoopReminderDto,
    ) {
        const result = await this.affirmationLoopService.setReminder(user.uid, id, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Loop reminder set',
            data: result.data,
        });
    }

    @Patch(':id/reminder')
    @ApiOperation({
        summary: 'Update a loop\'s reminder times',
        description: 'Partially updates the reminder schedule for this loop.',
    })
    @ApiParam({ name: 'id', description: 'Affirmation loop ID' })
    @ApiBody({ type: UpdateLoopReminderDto })
    @ApiResponse({ status: 200, description: 'Reminder updated', type: LoopReminderResponseDto })
    @ApiResponse({ status: 404, description: 'User, affirmation loop, or reminder not found' })
    async updateReminder(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') id: string,
        @Body() dto: UpdateLoopReminderDto,
    ) {
        const result = await this.affirmationLoopService.updateReminder(user.uid, id, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Loop reminder updated',
            data: result.data,
        });
    }

    @Delete(':id/reminder')
    @ApiOperation({
        summary: 'Disable reminders for a loop',
        description: 'Deactivates the reminder schedule for this loop without deleting it.',
    })
    @ApiParam({ name: 'id', description: 'Affirmation loop ID' })
    @ApiResponse({ status: 200, description: 'Reminder disabled', type: LoopReminderResponseDto })
    @ApiResponse({ status: 404, description: 'User, affirmation loop, or reminder not found' })
    async deleteReminder(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('id') id: string,
    ) {
        const result = await this.affirmationLoopService.disableReminder(user.uid, id);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Loop reminder disabled',
            data: result.data,
        });
    }

    @Get('tokens')
    @ApiOperation({
        summary: 'Get remaining loop token balance',
        description:
            'Returns the number of loop generations the user has left this month, and when the allowance last reset.',
    })
    @ApiResponse({ status: 200, description: 'Token balance retrieved' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getTokenBalance(@FirebaseUser() user: auth.DecodedIdToken) {
        const result = await this.affirmationLoopService.getTokenBalance(user.uid);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Loop token balance retrieved',
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
