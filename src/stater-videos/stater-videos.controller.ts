import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  getFileUrls() {
    const result = this.staterVideosService.getFileUrls();
    if (result.isError) throw result.error;

    return this.response({
      message: 'File URLs retrieved',
      data: result.data,
    });
  }

  @Get('music')
  getMusicUrls() {
    const result = this.staterVideosService.getMusicUrls();
    if (result.isError) throw result.error;

    return this.response({
      message: 'Music URLs retrieved',
      data: result.data,
    });
  }

  @Get('meditations')
  @ApiOperation({
    summary: 'List meditation tracks',
    description:
      'Returns admin-curated meditation audio tracks uploaded to the Meditations/ folder in storage.',
  })
  @ApiResponse({ status: 200, description: 'Meditation tracks retrieved' })
  async getMeditations() {
    const result = await this.staterVideosService.getResourceBankMedia(
      'meditations',
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Meditation tracks retrieved',
      data: result.data,
    });
  }

  @Get('breath-work')
  @ApiOperation({
    summary: 'List breath work tracks',
    description:
      'Returns admin-curated breath work audio tracks uploaded to the Breath Work/ folder in storage.',
  })
  @ApiResponse({ status: 200, description: 'Breath work tracks retrieved' })
  async getBreathWork() {
    const result = await this.staterVideosService.getResourceBankMedia(
      'breath-work',
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Breath work tracks retrieved',
      data: result.data,
    });
  }

  @Get('emotional-processing')
  @ApiOperation({
    summary: 'List emotional processing tracks',
    description:
      'Returns admin-curated emotional processing audio tracks uploaded to the Emotional Processing/ folder in storage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Emotional processing tracks retrieved',
  })
  async getEmotionalProcessing() {
    const result = await this.staterVideosService.getResourceBankMedia(
      'emotional-processing',
    );
    if (result.isError) throw result.error;

    return this.response({
      message: 'Emotional processing tracks retrieved',
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
  @ApiResponse({
    status: 400,
    description: 'Invalid input or TTS generation failed',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async generatePersonaTts(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Body() dto: GeneratePersonaTtsDto,
  ) {
    const result = await this.staterVideosService.generatePersonaTts(
      user.uid,
      dto,
    );
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
