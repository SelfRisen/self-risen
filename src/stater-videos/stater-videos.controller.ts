import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';
import { BaseController, FirebaseUser } from 'src/common';
import { auth } from 'firebase-admin';
import { StaterVideosService } from './stater-videos.service';
import { GeneratePersonaTtsDto } from './dto';

@ApiTags('Stater Videos')
@Controller('stater-videos')
export class StaterVideosController extends BaseController {
    constructor(private readonly staterVideosService: StaterVideosService) {
        super();
    }

    @Get('files')
    async getFileUrls() {
        const result = await this.staterVideosService.getFileUrls();
        if (result.isError) throw result.error;

        return this.response({
            message: 'File URLs retrieved',
            data: result.data,
        });
    }

    @Get('music')
    async getMusicUrls() {
        const result = await this.staterVideosService.getMusicUrls();
        if (result.isError) throw result.error;

        return this.response({
            message: 'Music URLs retrieved',
            data: result.data,
        });
    }

    @Post('tts')
    @UseGuards(FirebaseGuard)
    @ApiBearerAuth('firebase')
    @ApiOperation({
        summary: 'Generate TTS audio with a persona voice',
        description:
            'Converts the provided text to speech using one of the default persona voices (Sage, Phoenix, River, Quinn, Alex, or Robin). Returns a hosted audio URL.',
    })
    @ApiBody({ type: GeneratePersonaTtsDto })
    @ApiResponse({ status: 201, description: 'TTS audio generated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input or TTS generation failed' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async generatePersonaTts(
        @FirebaseUser() user: auth.DecodedIdToken,
        @Body() dto: GeneratePersonaTtsDto,
    ) {
        const result = await this.staterVideosService.generatePersonaTts(user.uid, dto);
        if (result.isError) throw result.error;

        return this.response({
            message: 'TTS audio generated',
            data: result.data,
        });
    }

    // @Get('sessions')
    // async getAllSessions(
    //     @Query('page') page?: string,
    //     @Query('limit') limit?: string,
    // ) {
    //     const pageNumber = page ? parseInt(page, 10) : 1;
    //     const limitNumber = limit ? parseInt(limit, 10) : 10;

    //         const result = await this.staterVideosService.getAllSessions(
    //         pageNumber,
    //         limitNumber,
    //     );
    //     if (result.isError) throw result.error;

    //     return this.response({
    //         message: 'Reflection sessions retrieved',
    //         data: result.data,
    //     });
    // }
}
