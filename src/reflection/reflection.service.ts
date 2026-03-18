import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { DatabaseProvider } from 'src/database/database.provider';
import { BaseService } from 'src/common';
import { StorageService, FileType } from 'src/common/storage/storage.service';
import { TranscriptionService } from './services/transcription.service';
import { NlpTransformationService } from './services/nlp-transformation.service';
import { TextToSpeechService } from './services/text-to-speech.service';
import { CreateSessionDto, SubmitBeliefDto, ReRecordBeliefDto, CreateWaveDto, UpdateWaveDto, RegenerateVoiceDto, VoicePreferenceDto, EditAffirmationDto } from './dto';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';
import { NotificationTypeEnum, NotificationChannelTypeEnum } from 'src/notifications/enums/notification.enum';
import { randomUUID } from 'crypto';
import { StaterVideosService } from 'src/stater-videos/stater-videos.service';

@Injectable()
export class ReflectionService extends BaseService {
    private readonly logger = new Logger(ReflectionService.name);

    // Category name to prompt mapping
    private readonly PROMPT_MAPPING: Record<string, string> = {
        'Finances': 'Money is...',
        'Finance': 'Money is...',
        'Relationships': 'Love is...',
        'Relationship': 'Love is...',
        'Health & Well-being': 'My body is...',
        'Health': 'My body is...',
        'Career / Work': 'My work is...',
        'Career': 'My work is...',
        'Work': 'My work is...',
        'Personal Growth': 'I am...',
        'Personal Development': 'I am...',
        'Leisure & Fun': 'Fun is...',
        'Leisure': 'Fun is...',
        'Environment': 'My environment is...',
        'Spirituality / Mindfulness': 'Spirituality is...',
        'Spirituality': 'Spirituality is...',
        'Mindfulness': 'Mindfulness is...',
    };

    constructor(
        private prisma: DatabaseProvider,
        private storageService: StorageService,
        private transcriptionService: TranscriptionService,
        private nlpTransformationService: NlpTransformationService,
        private textToSpeechService: TextToSpeechService,
        private notificationService: INotificationService,
        private staterVideosService: StaterVideosService,
    ) {
        super();
    }

    async createSession(firebaseId: string, dto: CreateSessionDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const category = await this.validateCategoryOwnership(user.id, dto.categoryId);
        if (!category) {
            return this.HandleError(new NotFoundException('Category not found or does not belong to user'));
        }

        const prompt = this.generatePrompt(category.name);

        const session = await this.prisma.reflectionSession.create({
            data: {
                userId: user.id,
                categoryId: dto.categoryId,
                prompt,
                status: 'PENDING',
            },
        });


        return this.Results(session);
    }

    async createSessionWithOutCategory(firebaseId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // const prompt = 'An area of my life I want to improve is...';

        const session = await this.prisma.reflectionSession.create({
            data: {
                userId: user.id,
                isGlobal: true,
                status: 'PENDING',
            },
        });

        return this.Results(session);
    }

    async getSessionById(firebaseId: string, sessionId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
            include: {
                reflectionSound: {
                    select: {
                        id: true,
                        soundUrl: true,
                        name: true,
                        fileSize: true,
                        mimeType: true,
                    },
                },
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        return this.Results(session);
    }

    /**
     * Create or replace the sound for a reflection session (1:1). Selects by name from the stater-videos music list.
     */
    async createReflectionSound(firebaseId: string, sessionId: string, name: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
            include: { reflectionSound: true },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        const sound = this.staterVideosService.getSoundByName(name);
        if (!sound) {
            return this.HandleError(new NotFoundException('Sound not found'));
        }

        const soundData = {
            soundUrl: sound.url,
            name: sound.name,
            fileSize: null as number | null,
            mimeType: null as string | null,
        };

        let reflectionSound;
        if (session.reflectionSound) {
            reflectionSound = await this.prisma.reflectionSound.update({
                where: { id: session.reflectionSound.id },
                data: soundData,
            });
        } else {
            reflectionSound = await this.prisma.reflectionSound.create({
                data: {
                    reflectionSessionId: sessionId,
                    ...soundData,
                },
            });
        }

        return this.Results(reflectionSound);
    }

    /**
     * Get the sound for a reflection session (1:1, so returns single sound or null).
     */
    async getSoundForReflection(firebaseId: string, sessionId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
            include: {
                reflectionSound: {
                    select: {
                        id: true,
                        soundUrl: true,
                        name: true,
                        fileSize: true,
                        mimeType: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        return this.Results({
            sound: session.reflectionSound ?? null,
        });
    }

    async getAllSessions(
        firebaseId: string,
        page: number = 1,
        limit: number = 10,
        categoryId?: string
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const pageNumber = Math.max(1, Math.floor(page));
        const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
        const skip = (pageNumber - 1) * pageSize;

        const whereClause: any = { userId: user.id };
        if (categoryId) {
            whereClause.categoryId = categoryId;
        }

        const totalCount = await this.prisma.reflectionSession.count({
            where: whereClause,
        });

        const sessions = await this.prisma.reflectionSession.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                reflectionSound: {
                    select: {
                        id: true,
                        soundUrl: true,
                        name: true,
                        fileSize: true,
                        mimeType: true,
                    },
                },
            },
        });

        const totalPages = Math.ceil(totalCount / pageSize);

        return this.Results({
            data: sessions,
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

    /**
     * Submit belief (text or audio) for a reflection session
     */
    async submitBelief(
        firebaseId: string,
        sessionId: string,
        dto: SubmitBeliefDto,
        audioFile?: Express.Multer.File,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate session ownership and status
        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        if (session.status !== 'PENDING') {
            return this.HandleError(
                new BadRequestException('Belief has already been submitted for this session'),
            );
        }

        let rawBeliefText: string | undefined;
        let audioUrl: string | undefined;
        let transcriptionText: string | undefined;

        // Handle audio file transcription
        if (audioFile) {
            try {
                transcriptionText = await this.transcriptionService.transcribeAudio(audioFile);
                rawBeliefText = transcriptionText;
            } catch (error) {
                return this.HandleError(
                    new BadRequestException(`Failed to process audio file: ${error.message}`),
                );
            }
        } else if (dto.text) {
            rawBeliefText = dto.text;
        } else {
            return this.HandleError(
                new BadRequestException('Either text or audio file must be provided'),
            );
        }

        // Update session with belief
        const updatedSession = await this.prisma.reflectionSession.update({
            where: { id: sessionId },
            data: {
                rawBeliefText,
                audioUrl,
                transcriptionText,
                status: 'BELIEF_CAPTURED',
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return this.Results(updatedSession);
    }

    /**
     * Generate affirmation from belief using NLP transformation
     * Now creates a new Affirmation record instead of just updating the session.
     * Optional voicePreference is stored on the affirmation so it keeps this voice even if the user changes their default.
     */
    async generateAffirmation(firebaseId: string, sessionId: string, dto?: VoicePreferenceDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate session ownership and status
        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
            include: {
                affirmations: {
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        if (session.status !== 'BELIEF_CAPTURED' && session.status !== 'AFFIRMATION_GENERATED') {
            return this.HandleError(
                new BadRequestException(
                    `Cannot generate affirmation. Session must be in BELIEF_CAPTURED or AFFIRMATION_GENERATED status. Current status: ${session.status}`,
                ),
            );
        }

        if (!session.rawBeliefText || session.rawBeliefText.trim().length === 0) {
            return this.HandleError(
                new BadRequestException('Cannot generate affirmation. No belief text found in session.'),
            );
        }

        let transformation;
        try {
            transformation = await this.nlpTransformationService.transformBelief(
                session.rawBeliefText,
                user.id, // Pass userId for token tracking
            );
        } catch (error) {
            if (error instanceof ForbiddenException) {
                this.logger.warn(`Token limit exceeded for user ${user.id}`);
                return this.HandleError(error);
            }
            this.logger.error(`Error generating affirmation: ${error.message}`, error.stack);
            return this.HandleError(
                new BadRequestException(`Failed to generate affirmation: ${error.message}`),
            );
        }

        // Single path: create affirmation and update session (no second NLP call)
        const isFirstAffirmation = session.affirmations.length === 0;
        const nextOrder = session.affirmations.length;

        const voiceForTts = dto?.voicePreference
            ? (this.textToSpeechService.convertNameToEnum(dto.voicePreference) ?? user.ttsVoicePreference)
            : user.ttsVoicePreference;
        const voiceToStore = voiceForTts ?? null;

        let audioUrl: string | null = null;
        if (isFirstAffirmation && transformation.generatedAffirmation) {
            try {
                audioUrl = await this.textToSpeechService.generateAffirmationAudio(
                    transformation.generatedAffirmation,
                    user.id,
                    voiceForTts ?? undefined,
                );
            } catch (ttsError) {
                this.logger.warn(`TTS generation failed: ${ttsError.message}. Continuing without audio.`);
            }
        }

        const newAffirmation = await this.prisma.affirmation.create({
            data: {
                sessionId: sessionId,
                affirmationText: transformation.generatedAffirmation,
                audioUrl,
                isSelected: isFirstAffirmation,
                order: nextOrder,
                ttsVoicePreference: voiceToStore,
            },
        });

        const updateData: any = {
            limitingBelief: transformation.limitingBelief,
            status: 'AFFIRMATION_GENERATED',
        };
        if (isFirstAffirmation) {
            updateData.selectedAffirmationText = transformation.generatedAffirmation;
            updateData.selectedAffirmationAudioUrl = audioUrl;
        }

        const updatedSession = await this.prisma.reflectionSession.update({
            where: { id: sessionId },
            data: updateData,
            include: {
                category: {
                    select: { id: true, name: true },
                },
                affirmations: {
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        this.logger.log(`Created affirmation ${newAffirmation.id} for session ${sessionId} (order: ${nextOrder}, selected: ${isFirstAffirmation})`);
        return this.Results(updatedSession);
    }

    /**
     * Edit the affirmation text after AI has generated it.
     * Allowed when session is in AFFIRMATION_GENERATED status.
     * Clears AI-generated audio so user can regenerate voice for the new text.
     */
    async editAffirmation(firebaseId: string, sessionId: string, dto: EditAffirmationDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                affirmations: {
                    where: { isSelected: true },
                },
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        if (session.status !== 'AFFIRMATION_GENERATED') {
            return this.HandleError(
                new BadRequestException(
                    `Cannot edit affirmation. Session must be in AFFIRMATION_GENERATED status. Current status: ${session.status}`,
                ),
            );
        }

        if (!session.selectedAffirmationText || session.selectedAffirmationText.trim().length === 0) {
            return this.HandleError(
                new BadRequestException('Cannot edit affirmation. No selected affirmation found in session.'),
            );
        }

        const trimmedAffirmation = dto.affirmation.trim();
        if (trimmedAffirmation.length === 0) {
            return this.HandleError(
                new BadRequestException('Affirmation text cannot be empty.'),
            );
        }

        const selectedAffirmation = session.affirmations[0];
        const voiceToStore = dto.voicePreference
            ? (this.textToSpeechService.convertNameToEnum(dto.voicePreference) ?? undefined)
            : undefined;

        if (selectedAffirmation) {
            await this.prisma.affirmation.update({
                where: { id: selectedAffirmation.id },
                data: {
                    affirmationText: trimmedAffirmation,
                    audioUrl: null,
                    ...(voiceToStore !== undefined && { ttsVoicePreference: voiceToStore }),
                },
            });
        }

        const updatedSession = await this.prisma.reflectionSession.update({
            where: { id: sessionId },
            data: {
                selectedAffirmationText: trimmedAffirmation,
                selectedAffirmationAudioUrl: null, // Clear so user can regenerate TTS for new text
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                affirmations: {
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        return this.Results(updatedSession);
    }

    /**
     * Edit the belief text after AI has generated the affirmation.
     * Allowed when session is in AFFIRMATION_GENERATED status.
     * Affirmation and audio are unchanged.
     */
    async editBelief(firebaseId: string, sessionId: string, belief: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        if (session.status !== 'AFFIRMATION_GENERATED') {
            return this.HandleError(
                new BadRequestException(
                    `Cannot edit belief. Session must be in AFFIRMATION_GENERATED status. Current status: ${session.status}`,
                ),
            );
        }

        if (!session.selectedAffirmationText || session.selectedAffirmationText.trim().length === 0) {
            return this.HandleError(
                new BadRequestException('Cannot edit belief. No selected affirmation found in session.'),
            );
        }

        const trimmedBelief = belief.trim();
        if (trimmedBelief.length === 0) {
            return this.HandleError(
                new BadRequestException('Belief text cannot be empty.'),
            );
        }

        const updatedSession = await this.prisma.reflectionSession.update({
            where: { id: sessionId },
            data: {
                rawBeliefText: trimmedBelief,
                transcriptionText: trimmedBelief, // Keep in sync for display
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return this.Results(updatedSession);
    }

    /**
     * Re-record belief for a reflection session
     */
    async reRecordBelief(
        firebaseId: string,
        sessionId: string,
        dto: ReRecordBeliefDto,
        audioFile?: Express.Multer.File,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate session ownership
        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        // Allow re-recording if status is BELIEF_CAPTURED or AFFIRMATION_GENERATED
        if (session.status !== 'BELIEF_CAPTURED' && session.status !== 'AFFIRMATION_GENERATED') {
            return this.HandleError(
                new BadRequestException(
                    `Cannot re-record belief. Session must be in BELIEF_CAPTURED or AFFIRMATION_GENERATED status. Current status: ${session.status}`,
                ),
            );
        }

        let rawBeliefText: string | undefined;
        let audioUrl: string | undefined;
        let transcriptionText: string | undefined;

        // Handle audio transcription
        if (audioFile) {
            try {
                transcriptionText = await this.transcriptionService.transcribeAudio(audioFile);
                rawBeliefText = transcriptionText;
            } catch (error) {
                return this.HandleError(
                    new BadRequestException(`Failed to process audio file: ${error.message}`),
                );
            }
        } else if (dto.text) {
            rawBeliefText = dto.text;
        } else {
            return this.HandleError(
                new BadRequestException('Either text or audio file must be provided'),
            );
        }

        const newStatus = session.status === 'AFFIRMATION_GENERATED' ? 'BELIEF_CAPTURED' : session.status;

        // Update session with new belief
        const updatedSession = await this.prisma.reflectionSession.update({
            where: { id: sessionId },
            data: {
                rawBeliefText,
                audioUrl,
                transcriptionText,
                // Clear affirmation data if re-recording
                limitingBelief: newStatus === 'BELIEF_CAPTURED' ? null : session.limitingBelief,
                selectedAffirmationText: newStatus === 'BELIEF_CAPTURED' ? null : session.selectedAffirmationText,
                selectedAffirmationAudioUrl: newStatus === 'BELIEF_CAPTURED' ? null : session.selectedAffirmationAudioUrl,
                userAffirmationAudioUrl: newStatus === 'BELIEF_CAPTURED' ? null : session.userAffirmationAudioUrl,
                status: newStatus,
                beliefRerecordCount: session.beliefRerecordCount + 1,
                beliefRerecordedAt: new Date(),
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return this.Results(updatedSession);
    }

    /**
     * Record user's voice for affirmation
     */
    async recordUserAffirmation(
        firebaseId: string,
        sessionId: string,
        audioFile: Express.Multer.File,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate session ownership and status
        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        if (session.status !== 'AFFIRMATION_GENERATED') {
            return this.HandleError(
                new BadRequestException(
                    `Cannot record affirmation. Session must be in AFFIRMATION_GENERATED status. Current status: ${session.status}`,
                ),
            );
        }

        try {
            // Upload audio file
            const uploadResult = await this.storageService.uploadFile(
                audioFile,
                FileType.AUDIO,
                user.id,
                'affirmations/user-recorded',
            );

            // Update session with user's audio recording
            const updatedSession = await this.prisma.reflectionSession.update({
                where: { id: sessionId },
                data: {
                    userAffirmationAudioUrl: uploadResult.url,
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            return this.Results(updatedSession);
        } catch (error) {
            return this.HandleError(
                new BadRequestException(`Failed to upload audio file: ${error.message}`),
            );
        }
    }

    /**
     * Track playback of affirmation
     */
    async trackPlayback(firebaseId: string, sessionId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate session ownership
        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        // Update playback tracking
        const updatedSession = await this.prisma.reflectionSession.update({
            where: { id: sessionId },
            data: {
                playbackCount: session.playbackCount + 1,
                lastPlayedAt: new Date(),
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return this.Results(updatedSession);
    }

    /**
     * Create a wave for an existing session
     * Blocks creation if session already has an active wave
     */
    async createWave(firebaseId: string, dto: CreateWaveDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: dto.sessionId,
                userId: user.id,
            },
            include: {
                waves: {
                    where: {
                        isActive: true,
                    },
                },
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        // Check if session already has an active wave
        if (session.waves && session.waves.length > 0) {
            return this.HandleError(
                new BadRequestException(
                    'Cannot create a new wave. Session already has an active wave. Please wait for the current wave to end or deactivate it first.',
                ),
            );
        }

        if (!session.selectedAffirmationText) {
            return this.HandleError(
                new BadRequestException(
                    'Cannot create a wave. Session must have a selected affirmation.',
                ),
            );
        }

        const durationDays = dto.durationDays;
        const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
        if (dto.startDate && startDate < new Date()) {
            return this.HandleError(
                new BadRequestException('Wave start date cannot be in the past.'),
            );
        }
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + durationDays);

        // Create wave and return session in one round-trip via include
        const createdWave = await this.prisma.wave.create({
            data: {
                sessionId: dto.sessionId,
                startDate,
                endDate,
                durationDays,
                isActive: true,
            },
            include: {
                session: {
                    include: {
                        category: {
                            select: { id: true, name: true },
                        },
                        waves: {
                            where: { isActive: true },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                },
            },
        });

        return this.Results(createdWave.session);
    }

    /**
     * Update a wave
     */
    async updateWave(firebaseId: string, waveId: string, dto: UpdateWaveDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Find wave and validate ownership through session
        const wave = await this.prisma.wave.findFirst({
            where: {
                id: waveId,
            },
            include: {
                session: {
                    select: {
                        id: true,
                        userId: true,
                    },
                },
            },
        });

        if (!wave) {
            return this.HandleError(new NotFoundException('Wave not found'));
        }

        if (wave.session.userId !== user.id) {
            return this.HandleError(new NotFoundException('Wave not found'));
        }

        // Prepare update data
        const updateData: any = {};

        // Handle startDate update
        if (dto.startDate !== undefined) {
            const newStartDate = new Date(dto.startDate);
            
            // Validate that start date is not in the past
            if (newStartDate < new Date()) {
                return this.HandleError(
                    new BadRequestException('Wave start date cannot be in the past.'),
                );
            }

            updateData.startDate = newStartDate;

            // Recalculate endDate based on new startDate and current/updated duration
            const effectiveDuration = dto.durationDays ?? wave.durationDays;
            const newEndDate = new Date(newStartDate);
            newEndDate.setDate(newEndDate.getDate() + effectiveDuration);
            updateData.endDate = newEndDate;
            
            // Update duration if it was also provided
            if (dto.durationDays !== undefined) {
                updateData.durationDays = dto.durationDays;
            }
        } else if (dto.durationDays !== undefined) {
            // Only duration is being updated, use existing startDate
            updateData.durationDays = dto.durationDays;
            const newEndDate = new Date(wave.startDate);
            newEndDate.setDate(newEndDate.getDate() + dto.durationDays);
            updateData.endDate = newEndDate;
        }

        if (dto.isActive !== undefined) {
            updateData.isActive = dto.isActive;

            // If activating a wave, check if session already has an active wave
            if (dto.isActive === true) {
                const activeWave = await this.prisma.wave.findFirst({
                    where: {
                        sessionId: wave.sessionId,
                        isActive: true,
                        id: {
                            not: waveId, // Exclude current wave
                        },
                    },
                });

                if (activeWave) {
                    return this.HandleError(
                        new BadRequestException(
                            'Cannot activate this wave. Session already has another active wave.',
                        ),
                    );
                }
            }
        }

        // Update wave
        const updatedWave = await this.prisma.wave.update({
            where: { id: waveId },
            data: updateData,
            include: {
                session: {
                    include: {
                        category: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        waves: {
                            where: {
                                isActive: true,
                            },
                            orderBy: {
                                createdAt: 'desc',
                            },
                            take: 1,
                        },
                    },
                },
            },
        });

        return this.Results(updatedWave);
    }

    /**
     * Delete a wave
     */
    async deleteWave(firebaseId: string, waveId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const wave = await this.prisma.wave.findFirst({
            where: {
                id: waveId,
            },
            include: {
                session: {
                    select: {
                        id: true,
                        userId: true,
                    },
                },
            },
        });

        if (!wave) {
            return this.HandleError(new NotFoundException('Wave not found'));
        }

        if (wave.session.userId !== user.id) {
            return this.HandleError(new NotFoundException('Wave not found'));
        }

        // Delete wave
        await this.prisma.wave.delete({
            where: { id: waveId },
        });

        return this.Results(null);
    }

    /**
     * Regenerate AI affirmation audio with optional voice preference
     * If voice preference is provided, uses it; otherwise uses user's saved preference
     */
    async regenerateAffirmationVoice(firebaseId: string, sessionId: string, dto?: RegenerateVoiceDto) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate session ownership and status
        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
            include: {
                affirmations: {
                    where: { isSelected: true },
                },
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        // Only regenerate if affirmation exists (selected affirmation or session snapshot)
        const selectedAffirmation = session.affirmations[0];
        const affirmationText = selectedAffirmation?.affirmationText ?? session.selectedAffirmationText;
        if (!affirmationText || affirmationText.trim().length === 0) {
            return this.HandleError(
                new BadRequestException('Cannot regenerate voice. No selected affirmation found in session.'),
            );
        }

        if (session.status !== 'AFFIRMATION_GENERATED') {
            return this.HandleError(
                new BadRequestException(
                    `Cannot regenerate voice. Session must be in AFFIRMATION_GENERATED status. Current status: ${session.status}`,
                ),
            );
        }

        try {
            // Use dto override, then affirmation's saved voice, then user default; persist so affirmation remembers
            const voicePreference = dto?.voicePreference
                ? (this.textToSpeechService.convertNameToEnum(dto.voicePreference) ?? selectedAffirmation?.ttsVoicePreference ?? user.ttsVoicePreference)
                : (selectedAffirmation?.ttsVoicePreference ?? user.ttsVoicePreference ?? null);

            const selectedAffirmationAudioUrl = await this.textToSpeechService.generateAffirmationAudio(
                affirmationText,
                user.id,
                voicePreference ?? undefined,
            );

            if (selectedAffirmation) {
                await this.prisma.affirmation.update({
                    where: { id: selectedAffirmation.id },
                    data: {
                        audioUrl: selectedAffirmationAudioUrl,
                        ttsVoicePreference: voicePreference ?? undefined,
                    },
                });
            }

            const updatedSession = await this.prisma.reflectionSession.update({
                where: { id: sessionId },
                data: {
                    selectedAffirmationAudioUrl,
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    affirmations: {
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });

            this.logger.log(`Regenerated affirmation audio for session ${sessionId} with voice: ${voicePreference ?? 'default'}${dto?.voicePreference ? ' (override)' : ''}`);

            return this.Results(updatedSession);
        } catch (error) {
            this.logger.error(`Error regenerating affirmation voice: ${error.message}`, error.stack);
            return this.HandleError(
                new BadRequestException(`Failed to regenerate affirmation voice: ${error.message}`),
            );
        }
    }

    /**
     * Get all affirmations for a session
     */
    async getAffirmations(
        firebaseId: string,
        sessionId?: string,
        page: number = 1,
        limit: number = 10,
    ) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const pageNumber = Math.max(1, Math.floor(page));
        const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
        const skip = (pageNumber - 1) * pageSize;

        const whereClause = sessionId
            ? { sessionId, session: { userId: user.id } }
            : { session: { userId: user.id } };

        // When filtering by session, validate it exists before querying (so we can return 404 if invalid)
        if (sessionId) {
            const sessionExists = await this.prisma.reflectionSession.findFirst({
                where: { id: sessionId, userId: user.id },
                select: { id: true },
            });
            if (!sessionExists) {
                return this.HandleError(new NotFoundException('Reflection session not found'));
            }
        }

        const [totalCount, affirmations] = await Promise.all([
            this.prisma.affirmation.count({ where: whereClause }),
            this.prisma.affirmation.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
                ...(sessionId
                    ? {}
                    : {
                          include: {
                              session: {
                                  select: {
                                      isGlobal: true,
                                      reflectionSound: {
                                          select: {
                                              id: true,
                                              soundUrl: true,
                                          },
                                      },
                                  },
                              },
                          },
                      }),
            }),
        ]);

        

        const totalPages = Math.ceil(totalCount / pageSize);

        return this.Results({
            data: affirmations,
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

    /**
     * Select an affirmation as the active one for a session
     */
    async selectAffirmation(firebaseId: string, sessionId: string, affirmationId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        // Validate session ownership
        const session = await this.prisma.reflectionSession.findFirst({
            where: {
                id: sessionId,
                userId: user.id,
            },
        });

        if (!session) {
            return this.HandleError(new NotFoundException('Reflection session not found'));
        }

        // Validate affirmation belongs to this session
        const affirmation = await this.prisma.affirmation.findFirst({
            where: {
                id: affirmationId,
                sessionId: sessionId,
            },
        });

        if (!affirmation) {
            return this.HandleError(
                new NotFoundException('Affirmation not found or does not belong to this session'),
            );
        }

        // Generate audio if this affirmation doesn't have audio yet; use affirmation's saved voice or user default
        let audioUrl = affirmation.audioUrl;
        let voiceUsed: typeof user.ttsVoicePreference = affirmation.ttsVoicePreference ?? user.ttsVoicePreference ?? null;
        if (!audioUrl && affirmation.affirmationText) {
            try {
                audioUrl = await this.textToSpeechService.generateAffirmationAudio(
                    affirmation.affirmationText,
                    user.id,
                    voiceUsed ?? undefined,
                );

                this.logger.log(`Generated audio for affirmation ${affirmationId}`);
            } catch (ttsError) {
                this.logger.warn(`TTS generation failed for affirmation ${affirmationId}: ${ttsError.message}. Continuing without audio.`);
            }
        }

        // Use a transaction to ensure atomicity
        try {
            await this.prisma.$transaction(async (tx) => {
                // Unmark all other affirmations for this session
                await tx.affirmation.updateMany({
                    where: {
                        sessionId: sessionId,
                        id: { not: affirmationId },
                    },
                    data: {
                        isSelected: false,
                    },
                });

                // Mark the selected affirmation, update audio URL, and persist voice if we just generated (so affirmation remembers)
                await tx.affirmation.update({
                    where: { id: affirmationId },
                    data: {
                        isSelected: true,
                        audioUrl: audioUrl ?? undefined,
                        ...(voiceUsed != null && !affirmation.ttsVoicePreference && { ttsVoicePreference: voiceUsed }),
                    },
                });

                // Update session's selected affirmation snapshot
                await tx.reflectionSession.update({
                    where: { id: sessionId },
                    data: {
                        selectedAffirmationText: affirmation.affirmationText,
                        selectedAffirmationAudioUrl: audioUrl,
                    },
                });
            });

            // Fetch updated session with affirmations
            const updatedSession = await this.prisma.reflectionSession.findFirst({
                where: { id: sessionId },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    affirmations: {
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });

            this.logger.log(`Selected affirmation ${affirmationId} for session ${sessionId}`);

            // Expose computed affirmation playback URL (user recording > AI) so clients get one clear field
            const sessionWithComputed = updatedSession
                ? {
                      ...updatedSession,
                      affirmationAudioUrl:
                          updatedSession.userAffirmationAudioUrl ??
                          updatedSession.selectedAffirmationAudioUrl ??
                          null,
                  }
                : updatedSession;

            return this.Results(sessionWithComputed);
        } catch (error) {
            this.logger.error(`Error selecting affirmation: ${error.message}`, error.stack);
            return this.HandleError(
                new BadRequestException(`Failed to select affirmation: ${error.message}`),
            );
        }
    }

    /**
     * Delete an affirmation from a session
     * Cannot delete if it's the only affirmation or if it's currently selected
     */
    async deleteAffirmation(firebaseId: string, affirmationId: string) {
        const user = await this.getUserByFirebaseId(firebaseId);
        if (!user) {
            return this.HandleError(new NotFoundException('User not found'));
        }

        const affirmation = await this.prisma.affirmation.findFirst({
            where: {
                id: affirmationId,
            },
            include: {
                session: true
            }
        });

        if (!affirmation) {
            return this.HandleError(
                new NotFoundException('Affirmation not found'),
            );
        }

        // Prevent deletion if it's the selected affirmation
        // if (affirmation.isSelected) {
        //     return this.HandleError(
        //         new BadRequestException('Cannot delete the selected affirmation. Please select a different affirmation first.'),
        //     );
        // }

        if (affirmation.isSelected)
            await this.prisma.reflectionSession.update({
                where: { id: affirmation.sessionId },
                data: {
                    selectedAffirmationText: null,
                    selectedAffirmationAudioUrl: null,
                },
            });

        try {
            // Delete the affirmation
            await this.prisma.affirmation.delete({
                where: { id: affirmationId },
            });

            // TODO: Delete associated audio file from storage if needed
            // if (affirmation.audioUrl) {
            //     await this.storageService.deleteFile(affirmation.audioUrl);
            // }

            return this.Results(null);
        } catch (error) {
            this.logger.error(`Error deleting affirmation: ${error.message}`, error.stack);
            return this.HandleError(
                new BadRequestException(`Failed to delete affirmation: ${error.message}`),
            );
        }
    }

    /**
     * Helper: Validate category ownership
     */
    private async validateCategoryOwnership(userId: string, categoryId: string) {
        return this.prisma.wheelCategory.findFirst({
            where: {
                id: categoryId,
                wheel: { userId },
            },
        });
    }

      /**
     * Generate prompt based on category name
     */
      private generatePrompt(categoryName: string): string {
        if (this.PROMPT_MAPPING[categoryName]) {
            return this.PROMPT_MAPPING[categoryName];
        }

        const normalizedName = categoryName.toLowerCase();
        for (const [key, prompt] of Object.entries(this.PROMPT_MAPPING)) {
            if (normalizedName.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedName)) {
                return prompt;
            }
        }

        // Default prompt if no match found
        return `${categoryName} is...`;
    }

    /**
     * Helper: Get user by Firebase ID
     */
    private async getUserByFirebaseId(firebaseId: string) {
        return this.prisma.user.findUnique({
            where: { firebaseId },
        });
    }
}

