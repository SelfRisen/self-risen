import { Injectable, Logger } from '@nestjs/common';
import { config, BaseService } from 'src/common';
import { StorageService, FileType } from 'src/common/storage/storage.service';
import OpenAI from 'openai';
import { TtsVoicePreference } from '@prisma/client';
import {
    PERSONA_NAMES,
    PersonaName,
} from '../constants/persona.constants';

type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

interface PersonaConfig {
    openAiVoice: OpenAIVoice;
    name: PersonaName;
    displayName: string;
    description: string;
    personality: string[];
}

@Injectable()
export class TextToSpeechService extends BaseService {
    private readonly logger = new Logger(TextToSpeechService.name);
    private openai: OpenAI;

    private readonly PERSONA_MAPPING: Record<TtsVoicePreference, PersonaConfig> = {
        [TtsVoicePreference.SAGE]: {
            openAiVoice: 'nova',
            name: 'Sage',
            displayName: 'Sage (Empathetic Mentor)',
            description: 'Nurturing, warm voice that radiates compassion',
            personality: ['nurturing', 'compassionate', 'understanding', 'gentle'],
        },
        [TtsVoicePreference.PHOENIX]: {
            openAiVoice: 'shimmer',
            name: 'Phoenix',
            displayName: 'Phoenix (Energetic Motivator)',
            description: 'Upbeat, vibrant voice that inspires action',
            personality: ['upbeat', 'vibrant', 'motivating', 'enthusiastic'],
        },
        [TtsVoicePreference.RIVER]: {
            openAiVoice: 'onyx',
            name: 'River',
            displayName: 'River (Confident Coach)',
            description: 'Deep, authoritative voice that commands attention',
            personality: ['authoritative', 'grounding', 'powerful', 'commanding'],
        },
        [TtsVoicePreference.QUINN]: {
            openAiVoice: 'echo',
            name: 'Quinn',
            displayName: 'Quinn (Friendly Guide)',
            description: 'Warm, conversational voice that feels approachable',
            personality: ['approachable', 'supportive', 'encouraging', 'relatable'],
        },
        [TtsVoicePreference.ALEX]: {
            openAiVoice: 'alloy',
            name: 'Alex',
            displayName: 'Alex (Calm Companion)',
            description: 'Balanced, neutral voice that brings steadiness',
            personality: ['balanced', 'neutral', 'steady', 'peaceful'],
        },
        [TtsVoicePreference.ROBIN]: {
            openAiVoice: 'fable',
            name: 'Robin',
            displayName: 'Robin (Wise Advisor)',
            description: 'Thoughtful, mature voice that conveys wisdom',
            personality: ['thoughtful', 'mature', 'grounded', 'insightful'],
        },
    };

    private readonly NAME_TO_ENUM: Record<PersonaName, TtsVoicePreference> = {
        Sage: TtsVoicePreference.SAGE,
        Phoenix: TtsVoicePreference.PHOENIX,
        River: TtsVoicePreference.RIVER,
        Quinn: TtsVoicePreference.QUINN,
        Alex: TtsVoicePreference.ALEX,
        Robin: TtsVoicePreference.ROBIN,
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
     * Convert persona name (or legacy enum value) to TtsVoicePreference
     */
    convertNameToEnum(name: string): TtsVoicePreference | null {
        if (this.NAME_TO_ENUM[name as PersonaName]) {
            return this.NAME_TO_ENUM[name as PersonaName];
        }

        const upper = name.toUpperCase();
        if (Object.values(TtsVoicePreference).includes(upper as TtsVoicePreference)) {
            return upper as TtsVoicePreference;
        }

        return null;
    }

    /**
     * Convert TtsVoicePreference enum to persona name
     */
    convertEnumToName(preference: TtsVoicePreference): PersonaName | null {
        const config = this.PERSONA_MAPPING[preference];
        return config ? config.name : null;
    }

    /**
     * Map voice preference (enum or name) to OpenAI voice
     */
    private getVoiceFromPreference(preference?: string | null): OpenAIVoice {
        if (!preference) {
            return (config.OPENAI_TTS_VOICE || 'alloy') as OpenAIVoice;
        }

        const enumValue = this.convertNameToEnum(preference);
        if (enumValue) {
            return this.PERSONA_MAPPING[enumValue].openAiVoice;
        }

        if (config.NODE_ENV === 'development') {
            this.logger.warn(`Unknown voice preference: ${preference}, falling back to alloy`);
        }
        return 'alloy';
    }

    /**
     * Get persona metadata for a given preference
     */
    getPersonaMetadata(preference?: string | null): PersonaConfig | null {
        if (!preference) return null;
        const resolvedKey = this.convertNameToEnum(preference);
        return resolvedKey ? this.PERSONA_MAPPING[resolvedKey] : null;
    }

    /**
     * Get all available personas in display order
     */
    getAllPersonas(): Array<{ preference: TtsVoicePreference; config: PersonaConfig }> {
        return PERSONA_NAMES.map((name) => {
            const preference = this.NAME_TO_ENUM[name];
            return { preference, config: this.PERSONA_MAPPING[preference] };
        });
    }

    /**
     * Generate audio from affirmation text using OpenAI TTS API
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
