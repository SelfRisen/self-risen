import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';
import { FirebaseUser, StreakInterceptor } from 'src/common';
import { auth } from 'firebase-admin';
import { BaseController } from 'src/common';
import { ReflectionService } from './reflection.service';
import { CreateSessionDto, SubmitBeliefDto, ReflectionSessionResponseDto, ReRecordBeliefDto, CreateWaveDto, UpdateWaveDto, RegenerateVoiceDto, VoicePreferenceDto, EditAffirmationDto, EditBeliefDto, SetReflectionSoundDto } from './dto';

@UseGuards(FirebaseGuard)
@UseInterceptors(StreakInterceptor)
@ApiBearerAuth('firebase')
@ApiTags('Reflection')
@Controller('reflection')
export class ReflectionController extends BaseController {
    constructor(private readonly reflectionService: ReflectionService) {
        super();
    }

    @Post('sessions')
    @ApiOperation({
        summary: 'Create a new reflection session',
        description: 'Creates a new reflection session for a specific Wheel of Life category. Returns the session with a generated prompt. Note: Reflection sessions do not have durations. To create a listening period with duration, use the waves endpoint after generating an affirmation.',
    })
    @ApiBody({ type: CreateSessionDto })
    async createSession(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Body() dto: CreateSessionDto,
    ) {
        const result = await this.reflectionService.createSession(user.uid, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Reflection session created',
            data: result.data,
        });
    }

    @Post('sessions/without-category')
    @ApiOperation({
        summary: 'Create a reflection session without a category',
        description: 'Creates a new reflection session not tied to any Wheel of Life category.',
    })
    async createSessionWithoutCategory(@FirebaseUser() user: auth.DecodedIdToken) {
        const result = await this.reflectionService.createSessionWithOutCategory(user.uid);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Reflection session created (no category)',
            data: result.data,
        });
    }

    @Get('sessions/:sessionId')
    @ApiOperation({
        summary: 'Get reflection session details',
        description: 'Retrieves a reflection session by ID. User must own the session.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
   async getSessionById(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
    ) {
        const result = await this.reflectionService.getSessionById(user.uid, sessionId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Reflection session retrieved',
            data: result.data,
        });
    }

    @Get('sessions')
    @ApiOperation({
        summary: 'Get all reflection sessions',
        description: 'Retrieves all reflection sessions for the current user.',
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
        name: 'categoryId',
        required: false,
        type: String,
        description: 'Filter sessions by Wheel of Life category ID (optional)',
        example: 'category-id-123',
    })
    async getAllSessions(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('categoryId') categoryId?: string,
    ) {
        const pageNumber = page ? parseInt(page, 10) : 1;
        const limitNumber = limit ? parseInt(limit, 10) : 10;

        const result = await this.reflectionService.getAllSessions(
            user.uid,
            pageNumber,
            limitNumber,
            categoryId,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Reflection sessions retrieved',
            data: result.data,
        });
    }

    @Post('sessions/:sessionId/belief')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiOperation({
        summary: 'Submit belief for reflection session',
        description: 'Submits a belief (text or audio) for a reflection session. If audio is provided, it will be transcribed automatically.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Text input of the user\'s belief. Optional if audio file is provided.',
                    example: 'Money is stressful and scarce.',
                },
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Audio file containing the user\'s belief. Optional if text is provided.',
                },
            },
        },
    })
    async submitBelief(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Body() dto: SubmitBeliefDto,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        const result = await this.reflectionService.submitBelief(
            user.uid,
            sessionId,
            dto,
            file,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Belief submitted successfully',
            data: result.data,
        });
    }

    @Post('sessions/:sessionId/generate-affirmation')
    @ApiOperation({
        summary: 'Generate affirmation from belief',
        description: 'Transforms the user\'s limiting belief into an empowering affirmation using AI. Session must be in BELIEF_CAPTURED status. Optional voice is stored on the affirmation and does not change the user\'s default.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiBody({ type: VoicePreferenceDto, required: false })
    @ApiResponse({
        status: 200,
        description: 'Affirmation generated successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Session not in correct status or missing belief text',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session not found',
    })
    @ApiResponse({
        status: 500,
        description: 'Failed to generate affirmation',
    })
    async generateAffirmation(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Body() dto?: VoicePreferenceDto,
    ) {
        const result = await this.reflectionService.generateAffirmation(user.uid, sessionId, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation generated successfully',
            data: result.data,
        });
    }

    @Patch('sessions/:sessionId/affirmation')
    @ApiOperation({
        summary: 'Edit affirmation',
        description: 'Allows the user to edit the AI-generated affirmation text after it has been generated. Session must be in AFFIRMATION_GENERATED status. AI-generated audio is cleared so the user can regenerate voice for the new text.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiBody({ type: EditAffirmationDto })
    @ApiResponse({
        status: 200,
        description: 'Affirmation updated successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Session not in correct status or missing affirmation',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session not found',
    })
    async editAffirmation(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Body() dto: EditAffirmationDto,
    ) {
        const result = await this.reflectionService.editAffirmation(
            user.uid,
            sessionId,
            dto,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation updated successfully',
            data: result.data,
        });
    }

    @Patch('sessions/:sessionId/belief')
    @ApiOperation({
        summary: 'Edit belief',
        description: 'Allows the user to edit the belief text after the AI has generated the affirmation. Session must be in AFFIRMATION_GENERATED status. Affirmation and audio are unchanged.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiBody({ type: EditBeliefDto })
    @ApiResponse({
        status: 200,
        description: 'Belief updated successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Session not in correct status or missing affirmation',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session not found',
    })
    async editBelief(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Body() dto: EditBeliefDto,
    ) {
        const result = await this.reflectionService.editBelief(
            user.uid,
            sessionId,
            dto.belief,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Belief updated successfully',
            data: result.data,
        });
    }

    @Post('sessions/:sessionId/sound')
    @ApiOperation({
        summary: 'Create or replace sound for reflection session',
        description: 'Selects a sound from the stater-videos music list by name and sets it as the reflection session background sound (1:1). Replaces existing sound if present.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiBody({ type: SetReflectionSoundDto })
    @ApiResponse({ status: 200, description: 'Sound created or updated' })
    @ApiResponse({ status: 404, description: 'Reflection session not found or sound name not found' })
    async createReflectionSound(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Body() dto: SetReflectionSoundDto,
    ) {
        const result = await this.reflectionService.createReflectionSound(user.uid, sessionId, dto.name);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Sound saved successfully',
            data: result.data,
        });
    }

    @Get('sessions/:sessionId/sound')
    @ApiOperation({
        summary: 'Get sound for reflection session',
        description: 'Returns the reflection session\'s sound (1:1), or null if none set.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiResponse({ status: 200, description: 'Sound or null' })
    @ApiResponse({ status: 404, description: 'User or reflection session not found' })
    async getSoundForReflection(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
    ) {
        const result = await this.reflectionService.getSoundForReflection(user.uid, sessionId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Sound retrieved successfully',
            data: result.data,
        });
    }

    @Post('sessions/:sessionId/re-record-belief')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiOperation({
        summary: 'Re-record belief for reflection session',
        description: 'Allows user to re-record their belief. If session has affirmation generated, it will be reset to BELIEF_CAPTURED status.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Text input of the user\'s belief. Optional if audio file is provided.',
                    example: 'Money is stressful and scarce.',
                },
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Audio file containing the user\'s belief. Optional if text is provided.',
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Belief re-recorded successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request or session not in correct status',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session not found',
    })
    async reRecordBelief(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Body() dto: ReRecordBeliefDto,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        if (!file && !dto.text) {
            throw new BadRequestException('Either text or audio file must be provided');
        }

        const result = await this.reflectionService.reRecordBelief(
            user.uid,
            sessionId,
            dto,
            file,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Belief re-recorded successfully',
            data: result.data,
        });
    }

    @Post('sessions/:sessionId/record-affirmation')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Record user voice for affirmation',
        description: 'Uploads user\'s voice recording of the affirmation. This will be used for playback instead of AI-generated audio.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Audio file containing the user\'s voice recording of the affirmation.',
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Affirmation recorded successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request or session not in correct status',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session not found',
    })
    async recordAffirmation(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) {
            throw new BadRequestException('Audio file is required');
        }

        const result = await this.reflectionService.recordUserAffirmation(
            user.uid,
            sessionId,
            file,
        );
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation recorded successfully',
            data: result.data,
        });
    }

    @Post('sessions/:sessionId/track-playback')
    @ApiOperation({
        summary: 'Track affirmation playback',
        description: 'Tracks when user listens to the affirmation. Increments playback count and updates last played timestamp.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Playback tracked successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session not found',
    })
    async trackPlayback(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
    ) {
        const result = await this.reflectionService.trackPlayback(user.uid, sessionId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Playback tracked successfully',
            data: result.data,
        });
    }

    @Post('sessions/:sessionId/regenerate-voice')
    @ApiOperation({
        summary: 'Regenerate AI affirmation voice',
        description: 'Regenerates the AI-generated affirmation audio. Optionally accepts a voice preference (MALE, FEMALE, ANDROGYNOUS). If not provided, uses the user\'s saved preference. Session must have a selected affirmation and be in AFFIRMATION_GENERATED status.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiBody({
        type: RegenerateVoiceDto,
        required: false,
        description: 'Optional voice preference for regeneration',
        examples: {
            withPreference: {
                summary: 'Regenerate with specific voice',
                value: { voicePreference: 'FEMALE' }
            },
            useUserPreference: {
                summary: 'Regenerate using user\'s saved preference',
                value: {}
            }
        }
    })
    @ApiResponse({
        status: 200,
        description: 'Affirmation voice regenerated successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Session not in correct status or missing affirmation',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session not found',
    })
    async regenerateAffirmationVoice(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Body() dto?: RegenerateVoiceDto,
    ) {
        const result = await this.reflectionService.regenerateAffirmationVoice(user.uid, sessionId, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation voice regenerated successfully',
            data: result.data,
        });
    }

    @Post('waves')
    @ApiOperation({
        summary: 'Create a wave for an existing session',
        description: 'Creates a new wave (listening period) for an existing reflection session. Blocks creation if session already has an active wave. Session must have a selected affirmation.',
    })
    @ApiBody({ type: CreateWaveDto })
    @ApiResponse({
        status: 201,
        description: 'Wave created successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Session already has an active wave or missing affirmation',
    })
    @ApiResponse({
        status: 404,
        description: 'User or session not found',
    })
    async createWave(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Body() dto: CreateWaveDto,
    ) {
        const result = await this.reflectionService.createWave(user.uid, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Wave created successfully',
            data: result.data,
        });
    }

    @Put('waves/:waveId')
    @ApiOperation({
        summary: 'Update a wave',
        description: 'Updates an existing wave. Can modify duration or active status. When duration is updated, the end date is automatically recalculated from the start date. If activating a wave, ensures no other active wave exists for the session.',
    })
    @ApiParam({
        name: 'waveId',
        description: 'The unique identifier of the wave',
        example: 'wave-id-123',
    })
    @ApiBody({ type: UpdateWaveDto })
    @ApiResponse({
        status: 200,
        description: 'Wave updated successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Cannot activate wave - session already has another active wave',
    })
    @ApiResponse({
        status: 404,
        description: 'Wave not found',
    })
    async updateWave(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('waveId') waveId: string,
        @Body() dto: UpdateWaveDto,
    ) {
        const result = await this.reflectionService.updateWave(user.uid, waveId, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Wave updated successfully',
            data: result.data,
        });
    }

    @Delete('waves/:waveId')
    @ApiOperation({
        summary: 'Delete a wave',
        description: 'Deletes a wave from a reflection session. Returns the updated session.',
    })
    @ApiParam({
        name: 'waveId',
        description: 'The unique identifier of the wave',
        example: 'wave-id-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Wave deleted successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Wave not found',
    })
    async deleteWave(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('waveId') waveId: string,
    ) {
        const result = await this.reflectionService.deleteWave(user.uid, waveId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Wave deleted successfully',
            data: result.data,
        });
    }

    @Get('sessions/:sessionId/affirmations')
    @ApiOperation({
        summary: 'Get all affirmations for a session',
        description: 'Retrieves all generated affirmations for a reflection session, ordered by creation.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Affirmations retrieved successfully',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session not found',
    })
    async getAffirmations(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
    ) {
        const result = await this.reflectionService.getAffirmations(user.uid, sessionId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmations retrieved successfully',
            data: result.data,
        });
    }

    @Patch('sessions/:sessionId/affirmations/:affirmationId/select')
    @ApiOperation({
        summary: 'Select an affirmation as active',
        description: 'Marks the specified affirmation as the active/selected one for this session. Unselects any previously selected affirmation.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiParam({
        name: 'affirmationId',
        description: 'The unique identifier of the affirmation to select',
        example: 'affirmation-id-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Affirmation selected successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session or affirmation not found',
    })
    async selectAffirmation(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Param('affirmationId') affirmationId: string,
    ) {
        const result = await this.reflectionService.selectAffirmation(user.uid, sessionId, affirmationId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation selected successfully',
            data: result.data,
        });
    }

    @Delete('sessions/:sessionId/affirmations/:affirmationId')
    @ApiOperation({
        summary: 'Delete an affirmation',
        description: 'Removes an affirmation from the session. Cannot delete if it\'s the only affirmation or if it\'s currently selected.',
    })
    @ApiParam({
        name: 'sessionId',
        description: 'The unique identifier of the reflection session',
        example: 'session-id-123',
    })
    @ApiParam({
        name: 'affirmationId',
        description: 'The unique identifier of the affirmation to delete',
        example: 'affirmation-id-123',
    })
    @ApiResponse({
        status: 200,
        description: 'Affirmation deleted successfully',
        type: ReflectionSessionResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Cannot delete the only affirmation or the selected affirmation',
    })
    @ApiResponse({
        status: 404,
        description: 'Reflection session or affirmation not found',
    })
    async deleteAffirmation(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Param('sessionId') sessionId: string,
        @Param('affirmationId') affirmationId: string,
    ) {
        const result = await this.reflectionService.deleteAffirmation(user.uid, sessionId, affirmationId);
        if (result.isError) throw result.error;

        return this.response({
            message: 'Affirmation deleted successfully',
            data: result.data,
        });
    }
}

