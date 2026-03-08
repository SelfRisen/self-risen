import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UploadedFile, UseInterceptors, BadRequestException, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { BaseController } from 'src/common';
import { AuthGuard, FirebaseUser } from 'src/common/';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiBody, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { auth } from 'firebase-admin';
import { FirebaseGuard } from '@alpha018/nestjs-firebase-auth';
import { ChangeNameDto, ChangeUsernameDto, UploadAvatarDto, ChangeTtsVoicePreferenceDto, StreakCalendarQueryDto, StreakChartQueryDto, UpdateStreakReminderPreferencesDto } from './dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { StreakService } from 'src/common/services/streak.service';
import { TokenUsageService } from './token-usage.service';

@UseGuards(FirebaseGuard)
@ApiBearerAuth('firebase')
@Controller('user')
export class UserController extends BaseController {
  constructor(
    private readonly userService: UserService,
    private readonly streakService: StreakService,
    private readonly tokenUsageService: TokenUsageService,
  ) {
    super();
  }

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.userService.findAll(
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    );

    if (result.isError) throw result.error;

    return this.response({
      message: 'Users Retrieved',
      data: result.data,
    });
  }

  @Get('one')
  // @UseGuards(AuthGuard)
  // @ApiBearerAuth('firebase')
  async getUserProfile(@FirebaseUser() user: auth.DecodedIdToken) {
    const userProfile = await this.userService.getUserProfile(user.uid);

    if (userProfile.isError) throw userProfile.error;

    return this.response({
      message: 'Account Retrived',
      data: userProfile.data,
    })
  }

  @Patch('change-name')
  async changeName(@FirebaseUser() user: auth.DecodedIdToken, @Body() form: ChangeNameDto) {
    const updatedUser = await this.userService.changeName(user.uid, form);

    if (updatedUser.isError) throw updatedUser.error;

    return this.response({
      message: 'Names Updated',
      data: updatedUser.data,
    })
  }


  @Patch('change-username')
  async changeUsername(@FirebaseUser() user: auth.DecodedIdToken, @Body() form: ChangeUsernameDto) {
    const updatedUser = await this.userService.changeUsername(user.uid, form);

    if (updatedUser.isError) throw updatedUser.error;

    return this.response({
      message: 'Names Updated',
      data: updatedUser.data,
    })
  }

  @Patch('upload-avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload user avatar',
    description: 'Upload a new avatar image for the authenticated user. Supported formats: JPEG, PNG, GIF, WebP, SVG. Maximum file size: 10MB. The old avatar will be replaced if one exists.',
  })
  @ApiBody({
    description: 'Avatar image file',
    type: UploadAvatarDto,
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (JPEG, PNG, GIF, WebP, SVG)',
          example: 'avatar.jpg'
        }
      },
      required: ['file']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Avatar Updated'
        },
        data: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: '123e4567-e89b-12d3-a456-426614174000'
            },
            firebaseId: {
              type: 'string',
              example: 'firebase-user-id-123'
            },
            name: {
              type: 'string',
              example: 'John Doe'
            },
            username: {
              type: 'string',
              example: 'johndoe',
              nullable: true
            },
            email: {
              type: 'string',
              example: 'john@example.com'
            },
            avatar: {
              type: 'string',
              example: 'https://storage.example.com/images/avatars/user-id/avatar.jpg',
              description: 'URL of the uploaded avatar image'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z'
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - No file provided or invalid file type/size',
    schema: {
      type: 'object',
      properties: {
        statusCode: {
          type: 'number',
          example: 400
        },
        message: {
          type: 'string',
          example: 'No file provided',
          description: 'Error message - could be: "No file provided", "Invalid file type", or "File size exceeds maximum allowed size of 10MB for image"'
        },
        error: {
          type: 'string',
          example: 'Bad Request'
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
    schema: {
      type: 'object',
      properties: {
        statusCode: {
          type: 'number',
          example: 401
        },
        message: {
          type: 'string',
          example: 'Unauthorized'
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: {
          type: 'number',
          example: 404
        },
        message: {
          type: 'string',
          example: 'User not found'
        },
        error: {
          type: 'string',
          example: 'Not Found'
        }
      }
    }
  })
  async uploadAvatar(
    @FirebaseUser() user: auth.DecodedIdToken,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const updatedUser = await this.userService.uploadAvatar(user.uid, file);

    if (updatedUser.isError) throw updatedUser.error;

    return this.response({
      message: 'Avatar Updated',
      data: updatedUser.data,
    })
  }

  @Delete('delete-account')
  async remove(@FirebaseUser() user: auth.DecodedIdToken) {
    const deletedUser = await this.userService.deleteUser(user.uid);

    if (deletedUser.isError) throw deletedUser.error;

    return this.response({
      message: 'Account Updated',
      data: user.data,
    })
  }

  @Get('stats')
  async getStats(@FirebaseUser() user: auth.DecodedIdToken) {
    const stats = await this.userService.getStats(user.uid);

    if (stats.isError) throw stats.error;

    return this.response({
      message: 'Stats Retrived',
      data: stats.data,
    })
  }

  @Get('stats/streak-calendar')
  @ApiOperation({
    summary: 'Get streak calendar data',
    description: 'Returns streak activity data for a specific month/year to render a calendar view showing active days.',
  })
  @ApiQuery({ name: 'year', type: Number, required: true, example: 2024 })
  @ApiQuery({ name: 'month', type: Number, required: true, example: 1, description: 'Month (1-12)' })
  @ApiResponse({
    status: 200,
    description: 'Streak calendar data retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Streak calendar retrieved' },
        data: {
          type: 'object',
          properties: {
            year: { type: 'number', example: 2024 },
            month: { type: 'number', example: 1 },
            totalActiveDays: { type: 'number', example: 15 },
            days: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', example: '2024-01-15' },
                  dayOfMonth: { type: 'number', example: 15 },
                  streak: { type: 'number', example: 10 },
                },
              },
            },
          },
        },
      },
    },
  })
  async getStreakCalendar(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Query() query: StreakCalendarQueryDto,
  ) {
    const dbUser = await this.userService.getUserProfile(user.uid);
    if (dbUser.isError) throw dbUser.error;

    const calendarData = await this.streakService.getStreakCalendar(
      dbUser.data.id,
      query.year,
      query.month,
    );

    return this.response({
      message: 'Streak calendar retrieved',
      data: calendarData,
    });
  }

  @Get('stats/streak-chart')
  @ApiOperation({
    summary: 'Get streak chart data',
    description: 'Returns streak days per month for a given year (defaults to current year) to render a bar chart.',
  })
  @ApiQuery({ name: 'year', type: Number, required: false, example: 2024, description: 'Year (defaults to current year)' })
  @ApiResponse({
    status: 200,
    description: 'Streak chart data retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Streak chart retrieved' },
        data: {
          type: 'object',
          properties: {
            year: { type: 'number', example: 2024 },
            totalStreakDays: { type: 'number', example: 180 },
            months: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  month: { type: 'string', example: 'January' },
                  monthNumber: { type: 'number', example: 1 },
                  streakDays: { type: 'number', example: 15 },
                },
              },
            },
          },
        },
      },
    },
  })
  async getStreakChart(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Query() query: StreakChartQueryDto,
  ) {
    const dbUser = await this.userService.getUserProfile(user.uid);
    if (dbUser.isError) throw dbUser.error;

    const year = query.year || new Date().getFullYear();
    const chartData = await this.streakService.getStreakChart(dbUser.data.id, year);

    return this.response({
      message: 'Streak chart retrieved',
      data: chartData,
    });
  }

  @Get('streak-reminder-preferences')
  @ApiOperation({
    summary: 'Get streak reminder preferences',
    description: 'Returns the user’s streak reminder settings: enabled, custom times (HH:mm), and timezone. Empty times means defaults (08:00 and 18:00 UTC).',
  })
  @ApiResponse({
    status: 200,
    description: 'Streak reminder preferences',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Streak reminder preferences retrieved' },
        data: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', example: true },
            times: { type: 'array', items: { type: 'string' }, example: ['08:00', '18:00'] },
            timezone: { type: 'string', example: 'UTC' },
          },
        },
      },
    },
  })
  async getStreakReminderPreferences(@FirebaseUser() user: auth.DecodedIdToken) {
    const result = await this.userService.getStreakReminderPreferences(user.uid);
    if (result.isError) throw result.error;
    return this.response({
      message: 'Streak reminder preferences retrieved',
      data: result.data,
    });
  }

  @Patch('streak-reminder-preferences')
  @ApiOperation({
    summary: 'Update streak reminder preferences',
    description: 'Set when to receive streak reminders. Provide times (HH:mm 24h) and timezone; system will send morning/afternoon/evening messages at those times. Empty times = use defaults (08:00 and 18:00 UTC).',
  })
  @ApiBody({ type: UpdateStreakReminderPreferencesDto })
  @ApiResponse({
    status: 200,
    description: 'Updated streak reminder preferences',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Streak reminder preferences updated' },
        data: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            times: { type: 'array', items: { type: 'string' } },
            timezone: { type: 'string' },
          },
        },
      },
    },
  })
  async updateStreakReminderPreferences(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Body() body: UpdateStreakReminderPreferencesDto,
  ) {
    const result = await this.userService.updateStreakReminderPreferences(user.uid, body);
    if (result.isError) throw result.error;
    return this.response({
      message: 'Streak reminder preferences updated',
      data: result.data,
    });
  }

  @Get('preferences/tts-voice/personas')
  @ApiOperation({
    summary: 'Get all available TTS voice personas',
    description: 'Returns a list of all available voice personas with their details including name, role, gender, description, and personality traits. Use this endpoint to populate persona selection UI.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all available personas',
    schema: {
      type: 'object',
      properties: {
        personas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Sage' },
              displayName: { type: 'string', example: 'Sage (Empathetic Mentor)' },
              description: { type: 'string', example: 'Nurturing, warm voice that radiates compassion' },
              personality: { type: 'array', items: { type: 'string' }, example: ['nurturing', 'compassionate'] },
              preference: { type: 'string', example: 'FEMALE_EMPATHETIC' }
            }
          }
        }
      }
    }
  })
  async getAvailablePersonas() {
    const personas = await this.userService.getAvailablePersonas();
    
    if (personas.isError) throw personas.error;

    return this.response({
      message: 'Available voice personas retrieved',
      data: personas.data,
    })
  }

  @Patch('preferences/tts-voice')
  @ApiOperation({
    summary: 'Update TTS voice persona preference',
    description: 'Updates the user\'s text-to-speech voice persona preference. Choose from 6 distinct personas with unique names, personalities, and tones. This preference will be used for all future AI-generated affirmation audio.',
  })
  @ApiBody({
    type: ChangeTtsVoicePreferenceDto,
    examples: {
      sage: {
        summary: 'Sage (Empathetic Mentor)',
        value: { ttsVoicePreference: 'Sage' },
        description: 'Nurturing, warm voice that radiates compassion.'
      },
      phoenix: {
        summary: 'Phoenix (Energetic Motivator)',
        value: { ttsVoicePreference: 'Phoenix' },
        description: 'Upbeat, vibrant voice that inspires action.'
      },
      river: {
        summary: 'River (Confident Coach)',
        value: { ttsVoicePreference: 'River' },
        description: 'Deep, authoritative voice that commands attention.'
      },
      quinn: {
        summary: 'Quinn (Friendly Guide)',
        value: { ttsVoicePreference: 'Quinn' },
        description: 'Warm, conversational voice that feels approachable.'
      },
      alex: {
        summary: 'Alex (Calm Companion)',
        value: { ttsVoicePreference: 'Alex' },
        description: 'Balanced, neutral voice that brings steadiness.'
      },
      robin: {
        summary: 'Robin (Wise Advisor)',
        value: { ttsVoicePreference: 'Robin' },
        description: 'Thoughtful, mature voice that conveys wisdom.'
      }
    }
  })
  async changeTtsVoicePreference(
    @FirebaseUser() user: auth.DecodedIdToken,
    @Body() form: ChangeTtsVoicePreferenceDto
  ) {
    const updatedUser = await this.userService.changeTtsVoicePreference(user.uid, form);

    if (updatedUser.isError) throw updatedUser.error;

    return this.response({
      message: 'Voice persona preference updated',
      data: updatedUser.data,
    })
  }

  @Get('token-usage')
  @ApiOperation({
    summary: 'Get token usage statistics',
    description: 'Returns the current token usage for the authenticated user, including tokens used this month, remaining tokens, monthly limit, and days until reset.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token usage statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Token usage retrieved' },
        data: {
          type: 'object',
          properties: {
            tokensUsedThisMonth: { type: 'number', example: 15000 },
            tokenLimitPerMonth: { type: 'number', example: 30000 },
            tokensRemaining: { type: 'number', example: 15000 },
            usagePercentage: { type: 'number', example: 30.0 },
            resetDate: { type: 'string', format: 'date-time', example: '2026-03-01T00:00:00.000Z' },
            daysUntilReset: { type: 'number', example: 25 },
          },
        },
      },
    },
  })
  async getTokenUsage(@FirebaseUser() user: auth.DecodedIdToken) {
    const dbUser = await this.userService.getUserProfile(user.uid);
    if (dbUser.isError) throw dbUser.error;

    const tokenUsage = await this.tokenUsageService.getTokenUsage(dbUser.data.id);

    return this.response({
      message: 'Token usage retrieved',
      data: tokenUsage,
    });
  }
}
