import {
    BadRequestException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { AffirmationLoopStatus, TtsVoicePreference } from '@prisma/client';
import { BaseService } from 'src/common';
import { DatabaseProvider } from 'src/database/database.provider';
import { StorageService } from 'src/common/storage/storage.service';
import { StaterVideosService } from 'src/stater-videos/stater-videos.service';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';
import {
    CreateAffirmationLoopDto,
    CreateLoopReminderDto,
    UpdateAffirmationLoopDto,
    UpdateLoopReminderDto,
} from './dto';

export interface AudioMergeJobData {
    loopId: string;
}

@Injectable()
export class AffirmationLoopService extends BaseService {
    private readonly logger = new Logger(AffirmationLoopService.name);
    private readonly MAX_AFFIRMATIONS = 20;

    constructor(
        private readonly prisma: DatabaseProvider,
        private readonly storageService: StorageService,
        private readonly staterVideosService: StaterVideosService,
        private readonly textToSpeechService: TextToSpeechService,
        @InjectQueue('audio_merge') private readonly audioMergeQueue: Queue<AudioMergeJobData>,
    ) {
        super();
    }

    async createLoop(firebaseId: string, dto: CreateAffirmationLoopDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        if (user.loopTokensRemaining <= 0) {
            return this.HandleError(
                new HttpException('No loop tokens remaining', HttpStatus.PAYMENT_REQUIRED),
            );
        }

        if (dto.affirmationIds.length > this.MAX_AFFIRMATIONS) {
            return this.HandleError(
                new BadRequestException(`Maximum ${this.MAX_AFFIRMATIONS} affirmations per loop`),
            );
        }

        const uniqueIds = [...new Set(dto.affirmationIds)];
        if (uniqueIds.length !== dto.affirmationIds.length) {
            return this.HandleError(
                new BadRequestException('affirmationIds must not contain duplicates'),
            );
        }

        if (!this.staterVideosService.getSoundByName(dto.backgroundMusicKey)) {
            return this.HandleError(
                new BadRequestException(`Unknown background music: ${dto.backgroundMusicKey}`),
            );
        }

        const voicePreference = this.resolveVoicePreference(
            dto.voicePreference,
            user.ttsVoicePreference,
        );

        const affirmations = await this.prisma.affirmation.findMany({
            where: {
                id: { in: dto.affirmationIds },
                session: { userId: user.id },
            },
            include: { session: { select: { userId: true } } },
        });
        if (affirmations.length !== dto.affirmationIds.length) {
            return this.HandleError(
                new BadRequestException('One or more affirmations were not found'),
            );
        }

        const affirmationMap = new Map(affirmations.map((a) => [a.id, a]));
        for (const id of dto.affirmationIds) {
            const aff = affirmationMap.get(id)!;
            if (!aff.affirmationText?.trim()) {
                return this.HandleError(
                    new BadRequestException(`Affirmation ${id} has no text`),
                );
            }
        }

        let tokensRemaining = user.loopTokensRemaining;
        const loop = await this.prisma.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: { loopTokensRemaining: { decrement: 1 } },
            });
            tokensRemaining = updatedUser.loopTokensRemaining;

            const created = await tx.affirmationLoop.create({
                data: {
                    userId: user.id,
                    status: AffirmationLoopStatus.PROCESSING,
                    durationSeconds: dto.durationSeconds,
                    backgroundMusicKey: dto.backgroundMusicKey,
                    voicePreference: voicePreference ?? undefined,
                    name: dto.name ?? null,
                    description: dto.description ?? null,
                    items: {
                        create: dto.affirmationIds.map((affirmationId, sortOrder) => ({
                            affirmationId,
                            sortOrder,
                        })),
                    },
                },
                include: {
                    items: { orderBy: { sortOrder: 'asc' } },
                },
            });

            return created;
        });

        await this.audioMergeQueue.add('merge_loop', { loopId: loop.id });

        this.logger.log(`Enqueued audio merge for loop ${loop.id}`);

        return this.Results({
            ...this.toResponse(loop, null),
            tokensRemaining,
        });
    }

    async getTokenBalance(firebaseId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        return this.Results({
            tokensRemaining: user.loopTokensRemaining,
            resetAt: user.loopTokensResetAt,
        });
    }

    async updateLoop(firebaseId: string, loopId: string, dto: UpdateAffirmationLoopDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }
        
        const loop = await this.prisma.affirmationLoop.findUnique({
            where: { id: loopId, userId: user.id },
        });

        if (!loop) {
            return this.HandleError(new NotFoundException('Affirmation loop not found'));
        }

        const updated = await this.prisma.affirmationLoop.update({
            where: { id: loopId },
            data: {
                name: dto.name,
                description: dto.description,
                backgroundMusicKey: dto.backgroundMusicKey,
                durationSeconds: dto.durationSeconds,
            },
        });
        
        return this.Results(updated);
    }

    async getLoopById(firebaseId: string, loopId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const loop = await this.prisma.affirmationLoop.findFirst({
            where: { id: loopId, userId: user.id },
            include: {
                items: { orderBy: { sortOrder: 'asc' } },
            },
        });

        if (!loop) {
            return this.HandleError(new NotFoundException('Affirmation loop not found'));
        }

        const audioUrl = await this.resolveAudioUrl(loop.audioPath, loop.status);
        return this.Results(this.toResponse(loop, audioUrl));
    }

    async listLoops(firebaseId: string, page = 1, limit = 10) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const pageNumber = Math.max(1, Math.floor(page));
        const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
        const skip = (pageNumber - 1) * pageSize;

        const where = { userId: user.id };

        const [totalCount, loops] = await Promise.all([
            this.prisma.affirmationLoop.count({ where }),
            this.prisma.affirmationLoop.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
                include: {
                    items: { orderBy: { sortOrder: 'asc' } },
                },
            }),
        ]);

        const data = await Promise.all(
            loops.map(async (loop) => {
                const audioUrl = await this.resolveAudioUrl(loop.audioPath, loop.status);
                return this.toResponse(loop, audioUrl);
            }),
        );

        const totalPages = Math.ceil(totalCount / pageSize);

        return this.Results({
            data,
            pagination: {
                page: pageNumber,
                limit: pageSize,
                total: totalCount,
                totalPages,
                hasNextPage: pageNumber < totalPages,
                hasPreviousPage: pageNumber > 1,
            },
        });
    }

    private async getOwnedLoop(userId: string, loopId: string) {
        return this.prisma.affirmationLoop.findFirst({
            where: { id: loopId, userId },
        });
    }

    async setReminder(firebaseId: string, loopId: string, dto: CreateLoopReminderDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const loop = await this.getOwnedLoop(user.id, loopId);
        if (!loop) {
            return this.HandleError(new NotFoundException('Affirmation loop not found'));
        }

        if (!dto.morningTime && !dto.eveningTime) {
            return this.HandleError(
                new BadRequestException('At least one of morningTime or eveningTime is required'),
            );
        }

        const reminder = await this.prisma.loopReminder.upsert({
            where: { loopId },
            create: {
                userId: user.id,
                loopId,
                morningTime: dto.morningTime ?? null,
                eveningTime: dto.eveningTime ?? null,
                timezone: dto.timezone,
                isActive: true,
            },
            update: {
                morningTime: dto.morningTime ?? null,
                eveningTime: dto.eveningTime ?? null,
                timezone: dto.timezone,
                isActive: true,
            },
        });

        return this.Results(this.toReminderResponse(reminder));
    }

    async updateReminder(firebaseId: string, loopId: string, dto: UpdateLoopReminderDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const loop = await this.getOwnedLoop(user.id, loopId);
        if (!loop) {
            return this.HandleError(new NotFoundException('Affirmation loop not found'));
        }

        const existing = await this.prisma.loopReminder.findUnique({ where: { loopId } });
        if (!existing) {
            return this.HandleError(new NotFoundException('Reminder not found for this loop'));
        }

        const data: {
            morningTime?: string | null;
            eveningTime?: string | null;
            timezone?: string;
            isActive?: boolean;
        } = {};
        if (dto.morningTime !== undefined) data.morningTime = dto.morningTime;
        if (dto.eveningTime !== undefined) data.eveningTime = dto.eveningTime;
        if (dto.timezone !== undefined) data.timezone = dto.timezone;
        if (dto.isActive !== undefined) data.isActive = dto.isActive;

        const updated = await this.prisma.loopReminder.update({
            where: { loopId },
            data,
        });

        return this.Results(this.toReminderResponse(updated));
    }

    async disableReminder(firebaseId: string, loopId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const loop = await this.getOwnedLoop(user.id, loopId);
        if (!loop) {
            return this.HandleError(new NotFoundException('Affirmation loop not found'));
        }

        const existing = await this.prisma.loopReminder.findUnique({ where: { loopId } });
        if (!existing) {
            return this.HandleError(new NotFoundException('Reminder not found for this loop'));
        }

        const updated = await this.prisma.loopReminder.update({
            where: { loopId },
            data: { isActive: false },
        });

        return this.Results(this.toReminderResponse(updated));
    }

    private toReminderResponse(reminder: {
        id: string;
        loopId: string;
        morningTime: string | null;
        eveningTime: string | null;
        timezone: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    }) {
        return {
            id: reminder.id,
            loopId: reminder.loopId,
            morningTime: reminder.morningTime,
            eveningTime: reminder.eveningTime,
            timezone: reminder.timezone,
            isActive: reminder.isActive,
            createdAt: reminder.createdAt,
            updatedAt: reminder.updatedAt,
        };
    }

    async deleteLoop(firebaseId: string, loopId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const loop = await this.prisma.affirmationLoop.findFirst({
            where: { id: loopId, userId: user.id },
        });

        if (!loop) {
            return this.HandleError(new NotFoundException('Affirmation loop not found'));
        }

        if (loop.audioPath) {
            try {
                await this.storageService.deleteFile(loop.audioPath);
            } catch (error) {
                this.logger.warn(
                    `Failed to delete loop audio ${loop.audioPath}: ${error.message}`,
                );
            }
        }

        await this.prisma.affirmationLoop.delete({ where: { id: loopId } });

        return this.Results({ deleted: true, id: loopId });
    }

    private resolveVoicePreference(
        dtoVoice?: string,
        userDefault?: TtsVoicePreference | null,
    ): TtsVoicePreference | null {
        if (dtoVoice) {
            const resolved = this.textToSpeechService.convertNameToEnum(dtoVoice);
            if (resolved) return resolved;
        }
        return userDefault ?? null;
    }

    private async resolveAudioUrl(
        audioPath: string | null,
        status: AffirmationLoopStatus,
    ): Promise<string | null> {
        if (status !== AffirmationLoopStatus.READY || !audioPath) {
            return null;
        }
        try {
            return await this.storageService.getSignedUrl(audioPath, '1h');
        } catch (error) {
            this.logger.warn(`Failed to sign loop audio URL: ${error.message}`);
            return null;
        }
    }

    private toResponse(
        loop: {
            id: string;
            status: AffirmationLoopStatus;
            audioPath: string | null;
            durationSeconds: number | null;
            backgroundMusicKey: string;
            voicePreference: TtsVoicePreference | null;
            errorMessage: string | null;
            name: string | null;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
            items: { affirmationId: string; sortOrder: number }[];
        },
        audioUrl: string | null,
    ) {
        return {
            id: loop.id,
            status: loop.status,
            audioUrl,
            name: loop.name,
            description: loop.description,
            durationSeconds: loop.durationSeconds,
            backgroundMusicKey: loop.backgroundMusicKey,
            voicePreference: loop.voicePreference,
            affirmationIds: loop.items
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((i) => i.affirmationId),
            errorMessage: loop.errorMessage,
            createdAt: loop.createdAt,
            updatedAt: loop.updatedAt,
        };
    }

    private async getUserByFirebaseId(firebaseId: string) {
        return this.prisma.user.findUnique({
            where: { firebaseId },
        });
    }
}
