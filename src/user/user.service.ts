import { ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
// import { CreateUserDto, LoginUserDto, UpdateUserDto } from './dto';
import { User } from '@prisma/client';
import { DatabaseProvider } from 'src/database/database.provider';
import { BaseService, FileType, StorageService } from 'src/common';
import { ChangeNameDto, ChangeUsernameDto, ChangeTtsVoicePreferenceDto, UpdateStreakReminderPreferencesDto } from './dto';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';
import { UploadAvatarDto } from './dto/upload-avatar.dto';
import { config } from 'src/common';

const TTS_PERSONA_NAME_TO_ENUM: Record<string, string> = {
  Sage: 'FEMALE_EMPATHETIC',
  Phoenix: 'FEMALE_ENERGETIC',
  River: 'MALE_CONFIDENT',
  Quinn: 'MALE_FRIENDLY',
  Alex: 'ANDROGYNOUS_CALM',
  Robin: 'ANDROGYNOUS_WISE',
};

@Injectable()
export class UserService extends BaseService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private prisma: DatabaseProvider,
    private storageService: StorageService,
    private textToSpeechService: TextToSpeechService
  ) {
    super();
  }

  /**
   * Enrich user object with TTS voice persona details
   */
  private enrichUserWithPersonaDetails(user: any) {
    if (!user) return user;

    const personaDetails = user.ttsVoicePreference 
      ? this.textToSpeechService.getPersonaMetadata(user.ttsVoicePreference)
      : null;

    return {
      ...user,
      ttsVoicePersona: personaDetails ? {
        name: personaDetails.name,
        displayName: personaDetails.displayName,
        description: personaDetails.description,
        personality: personaDetails.personality
      } : null
    };
  }

  async findAll(page: number = 1, limit: number = 10) {
    const pageNumber = Math.max(1, Math.floor(page));
    const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
    const skip = (pageNumber - 1) * pageSize;

    const [totalCount, users] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip,
        take: pageSize,
        orderBy: { id: 'asc' },
      }),
    ]);

    const enrichedUsers = users.map(user => this.enrichUserWithPersonaDetails(user));
    const totalPages = Math.ceil(totalCount / pageSize);

    return this.Results({
      users: enrichedUsers,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalCount,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1,
      },
    });
  }

  async getUserProfile(firebaseId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId },
      include: {
        _count: {
          select: {
            reflectionSessions: true,
          }
        }
      }
    });

    if (!user) {
      return this.HandleError(
        new NotFoundException('User not found')
      )
    };

    const enrichedUser = this.enrichUserWithPersonaDetails(user);
    
    // Add token usage summary
    const now = new Date();
    const resetDate = new Date(user.tokenResetDate);
    const daysUntilReset = Math.max(0, Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    
    return this.Results({
      ...enrichedUser,
      tokenUsage: {
        tokensUsedThisMonth: user.tokensUsedThisMonth,
        tokenLimitPerMonth: user.tokenLimitPerMonth,
        tokensRemaining: Math.max(0, user.tokenLimitPerMonth - user.tokensUsedThisMonth),
        usagePercentage: Math.round((user.tokensUsedThisMonth / user.tokenLimitPerMonth) * 10000) / 100,
        resetDate: user.tokenResetDate,
        daysUntilReset,
      }
    });
  }

  async changeName(firebaseId: string, payload: ChangeNameDto) {
    const { name } = payload;

    try {
      const updatedUser = await this.prisma.user.update({
        where: { firebaseId },
        data: { name },
      });
      const enrichedUser = this.enrichUserWithPersonaDetails(updatedUser);
      return this.Results(enrichedUser);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2025') {
        return this.HandleError(new NotFoundException('User not found'));
      }
      throw error;
    }
  }

  async changeUsername(firebaseId: string, payload: ChangeUsernameDto) {
    const { username } = payload;

    try {
      const updatedUser = await this.prisma.user.update({
        where: { firebaseId },
        data: { username },
      });
      return this.Results(updatedUser);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2025') {
        return this.HandleError(new NotFoundException('User not found'));
      }
      throw error;
    }
  }

  async deleteUser(firebaseId: string) {
    try {
      await this.prisma.user.delete({
        where: { firebaseId },
      });
      return this.Results(null);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2025') {
        return this.HandleError(new NotFoundException('User not found'));
      }
      throw error;
    }
  }

  async uploadAvatar(
    firebaseId: string,
    file: Express.Multer.File
  ) {
    this.logger.debug(`Starting avatar upload for firebaseId: ${firebaseId}`);

    const user = await this.prisma.user.findUnique({
      where: { firebaseId }
    });

    if (!user) {
      this.logger.warn(`User not found for firebaseId: ${firebaseId}`);
      return this.HandleError(
        new NotFoundException('User not found')
      )
    };

    try {
      const upload = await this.storageService.uploadFile(
        file,
        FileType.IMAGE,
        user.id,
        'avatars'
      );
      this.logger.debug(`Upload successful for user ${user.id}, URL: ${upload.url}`);

      const avatar = upload.url;

      const updatedUser = await this.prisma.user.update({
        where: { firebaseId },
        data: {
          avatar,
        }
      });

      const enrichedUser = this.enrichUserWithPersonaDetails(updatedUser);
      return this.Results(enrichedUser);
    } catch (error) {
      this.logger.error(`Avatar upload failed for firebaseId ${firebaseId}: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  async getStats(firebaseId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId },
      select: {
        streak: true,
        sessions: true,
      }
    });

    if (!user) {
      return this.HandleError(
        new NotFoundException('User not found')
      )
    };

    return this.Results(user);
  }

  async changeTtsVoicePreference(firebaseId: string, payload: ChangeTtsVoicePreferenceDto) {
    const { ttsVoicePreference } = payload;

    const enumValue = TTS_PERSONA_NAME_TO_ENUM[ttsVoicePreference];
    if (!enumValue) {
      return this.HandleError(
        new BadRequestException(`Invalid persona name: ${ttsVoicePreference}`)
      );
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { firebaseId },
        data: { ttsVoicePreference: enumValue as any },
      });
      const enrichedUser = this.enrichUserWithPersonaDetails(updatedUser);
      return this.Results(enrichedUser);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2025') {
        return this.HandleError(new NotFoundException('User not found'));
      }
      throw error;
    }
  }

  async getAvailablePersonas() {
    const allPersonas = this.textToSpeechService.getAllPersonas();
    // Flat list; gender not exposed in API (personas shown without gender labels)
    const personas = [
      ...allPersonas.female,
      ...allPersonas.male,
      ...allPersonas.androgynous,
    ].map(p => ({
      name: p.config.name,
      displayName: p.config.displayName,
      description: p.config.description,
      personality: p.config.personality,
      preference: p.preference,
    }));

    return this.Results({ personas });
  }

  async getStreakReminderPreferences(firebaseId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId },
      select: {
        streakReminderEnabled: true,
        streakReminderTimes: true,
        timezone: true,
      },
    });

    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    return this.Results({
      enabled: user.streakReminderEnabled,
      times: user.streakReminderTimes ?? [],
      timezone: user.timezone ?? 'UTC',
    });
  }

  async updateStreakReminderPreferences(firebaseId: string, payload: UpdateStreakReminderPreferencesDto) {
    const data: { streakReminderEnabled?: boolean; streakReminderTimes?: string[]; timezone?: string } = {};
    if (payload.enabled !== undefined) data.streakReminderEnabled = payload.enabled;
    if (payload.times !== undefined) data.streakReminderTimes = payload.times;
    if (payload.timezone !== undefined) data.timezone = payload.timezone;

    try {
      const updated = await this.prisma.user.update({
        where: { firebaseId },
        data,
        select: {
          streakReminderEnabled: true,
          streakReminderTimes: true,
          timezone: true,
        },
      });
      return this.Results({
        enabled: updated.streakReminderEnabled,
        times: updated.streakReminderTimes ?? [],
        timezone: updated.timezone ?? 'UTC',
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2025') {
        return this.HandleError(new NotFoundException('User not found'));
      }
      throw error;
    }
  }
}