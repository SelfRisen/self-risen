import { Injectable, Logger } from '@nestjs/common';
import { config, BaseService } from 'src/common';
import { StorageService, FileType } from 'src/common/storage/storage.service';
import OpenAI from 'openai';
import { TtsVoicePreference } from '@prisma/client';

type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

interface PersonaConfig {
    openAiVoice: OpenAIVoice;
    gender: 'male' | 'female' | 'androgynous';
    name: string;
    displayName: string;
    description: string;
    personality: string[];
}

@Injectable()
export class TextToSpeechService extends BaseService {
    private readonly logger = new Logger(TextToSpeechService.name);
    private openai: OpenAI;

    private readonly PERSONA_MAPPING: Record<TtsVoicePreference, PersonaConfig> = {
        // Male (internal mapping only; not shown in UI)
        [TtsVoicePreference.MALE_CONFIDENT]: {
            openAiVoice: 'onyx',
            gender: 'male',
            name: 'River',
            displayName: 'River (Confident Coach)',
            description: 'Deep, authoritative voice that commands attention',
            personality: ['authoritative', 'grounding', 'powerful', 'commanding']
        },
        [TtsVoicePreference.MALE_FRIENDLY]: {
            openAiVoice: 'echo',
            gender: 'male',
            name: 'Quinn',
            displayName: 'Quinn (Friendly Guide)',
            description: 'Warm, conversational voice that feels approachable',
            personality: ['approachable', 'supportive', 'encouraging', 'relatable']
        },

        // Female (internal mapping only; not shown in UI)
        [TtsVoicePreference.FEMALE_EMPATHETIC]: {
            openAiVoice: 'nova',
            gender: 'female',
            name: 'Sage',
            displayName: 'Sage (Empathetic Mentor)',
            description: 'Nurturing, warm voice that radiates compassion',
            personality: ['nurturing', 'compassionate', 'understanding', 'gentle']
        },
        [TtsVoicePreference.FEMALE_ENERGETIC]: {
            openAiVoice: 'shimmer',
            gender: 'female',
            name: 'Phoenix',
            displayName: 'Phoenix (Energetic Motivator)',
            description: 'Upbeat, vibrant voice that inspires action',
            personality: ['upbeat', 'vibrant', 'motivating', 'enthusiastic']
        },

        // Other
        [TtsVoicePreference.ANDROGYNOUS_CALM]: {
            openAiVoice: 'alloy',
            gender: 'androgynous',
            name: 'Alex',
            displayName: 'Alex (Calm Companion)',
            description: 'Balanced, neutral voice that brings steadiness',
            personality: ['balanced', 'neutral', 'steady', 'peaceful']
        },
        [TtsVoicePreference.ANDROGYNOUS_WISE]: {
            openAiVoice: 'fable',
            gender: 'androgynous',
            name: 'Robin',
            displayName: 'Robin (Wise Advisor)',
            description: 'Thoughtful, mature voice that conveys wisdom',
            personality: ['thoughtful', 'mature', 'grounded', 'insightful']
        }
    };

    // Name to enum mapping for easy lookup
    private readonly NAME_TO_ENUM: Record<string, TtsVoicePreference> = {
        'Sage': TtsVoicePreference.FEMALE_EMPATHETIC,
        'Phoenix': TtsVoicePreference.FEMALE_ENERGETIC,
        'River': TtsVoicePreference.MALE_CONFIDENT,
        'Quinn': TtsVoicePreference.MALE_FRIENDLY,
        'Alex': TtsVoicePreference.ANDROGYNOUS_CALM,
        'Robin': TtsVoicePreference.ANDROGYNOUS_WISE,
    };

    constructor(private storageService: StorageService) {
        super();
        this.openai = new OpenAI({
            apiKey: config.OPENAI_API_KEY,
        });
        if (config.NODE_ENV === 'development') {
            this.logger.log('OpenAI TTS client initialized');
        }
    }

    /**
     * Convert persona name to TtsVoicePreference enum
     */
    convertNameToEnum(name: string): TtsVoicePreference | null {
        return this.NAME_TO_ENUM[name] || null;
    }

    /**
     * Convert TtsVoicePreference enum to persona name
     */
    convertEnumToName(preference: TtsVoicePreference): string | null {
        const config = this.PERSONA_MAPPING[preference];
        return config ? config.name : null;
    }

    /**
     * Map voice preference (enum or name) to OpenAI voice
     */
    private getVoiceFromPreference(preference?: string | null): OpenAIVoice {
        if (!preference) {
            // Fallback to config or default
            return (config.OPENAI_TTS_VOICE || 'alloy') as OpenAIVoice;
        }

        // Check if it's a name first
        const enumValue = this.NAME_TO_ENUM[preference];
        if (enumValue) {
            return this.PERSONA_MAPPING[enumValue].openAiVoice;
        }

        // Otherwise treat as enum value
        const personaConfig = this.PERSONA_MAPPING[preference as TtsVoicePreference];
        if (personaConfig) {
            return personaConfig.openAiVoice;
        }

        if (config.NODE_ENV === 'development') {
            this.logger.warn(`Unknown voice preference: ${preference}, falling back to alloy`);
        }
        return 'alloy';
    }

    /**
     * Get persona metadata for a given preference
     * Useful for API responses to show users their selected persona info
     */
    getPersonaMetadata(preference?: string | null): PersonaConfig | null {
        if (!preference) return null;
        const resolvedKey = this.NAME_TO_ENUM[preference] ?? (preference as TtsVoicePreference);
        return this.PERSONA_MAPPING[resolvedKey] ?? null;
    }

    /**
     * Get all available personas grouped by gender
     */
    getAllPersonas(): Record<string, Array<{ preference: TtsVoicePreference; config: PersonaConfig }>> {
        const grouped: Record<string, Array<{ preference: TtsVoicePreference; config: PersonaConfig }>> = {
            male: [],
            female: [],
            androgynous: []
        };

        for (const [preference, personaConfig] of Object.entries(this.PERSONA_MAPPING)) {
            grouped[personaConfig.gender].push({
                preference: preference as TtsVoicePreference,
                config: personaConfig,
            });
        }

        return grouped;
    }

    /**
     * Generate audio from affirmation text using OpenAI TTS API
     * @param affirmationText - The affirmation text to convert to speech
     * @param userId - User ID for storage path
     * @param voicePreference - Optional voice persona preference (e.g., MALE_CONFIDENT, FEMALE_EMPATHETIC)
     * @returns Audio URL or null if generation fails
     */
    async generateAffirmationAudio(
        affirmationText: string,
        userId: string,
        voicePreference?: string | null,
    ): Promise<string | null> {
        if (!affirmationText || affirmationText.trim().length === 0) {
            if (config.NODE_ENV === 'development') {
                this.logger.warn('Empty affirmation text provided for TTS');
            }
            return null;
        }

        const timeoutMs = config.OPENAI_REQUEST_TIMEOUT_MS;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        try {
            if (config.NODE_ENV === 'development') {
                this.logger.log(`Generating TTS audio for affirmation (${affirmationText.length} chars)`);
            }

            const model = config.OPENAI_TTS_MODEL;
            const voice = this.getVoiceFromPreference(voicePreference);

            const response = await this.openai.audio.speech.create(
                {
                    model,
                    voice,
                    input: affirmationText,
                    response_format: 'mp3',
                },
                { signal: abortController.signal },
            );

            const audioBuffer = Buffer.from(await response.arrayBuffer());

            // Create a temporary file-like object for upload
            const audioFile: Express.Multer.File = {
                fieldname: 'audio',
                originalname: 'affirmation.mp3',
                encoding: '7bit',
                mimetype: 'audio/mpeg',
                buffer: audioBuffer,
                size: audioBuffer.length,
                destination: '',
                filename: '',
                path: '',
                stream: null as any,
            };

            // Upload to storage
            const uploadResult = await this.storageService.uploadFile(
                audioFile,
                FileType.AUDIO,
                userId,
                'affirmations/ai-generated',
            );

            if (config.NODE_ENV === 'development') {
                this.logger.log(`TTS audio generated and uploaded: ${uploadResult.url}`);
            }
            return uploadResult.url;
        } catch (error) {
            this.logger.error(`Error generating TTS audio: ${error.message}`, error.stack);
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}
