import { Injectable, Logger } from '@nestjs/common';
import { config, BaseService } from 'src/common';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class TranscriptionService extends BaseService {
    private readonly logger = new Logger(TranscriptionService.name);
    private openai: OpenAI | null = null;

    constructor() {
        super();
        if (config.OPENAI_API_KEY) {
            this.openai = new OpenAI({
                apiKey: config.OPENAI_API_KEY,
            });
            if (config.NODE_ENV === 'development') {
                this.logger.log('OpenAI client initialized');
            }
        } else {
            if (config.NODE_ENV === 'development') {
                this.logger.warn('OPENAI_API_KEY not configured. Transcription will return placeholder text.');
            }
        }
    }

    /**
     * Transcribe audio file from URL or file buffer using OpenAI Whisper API
     * @param audioInput - URL string of the audio file or Express.Multer.File to transcribe
     * @returns Transcribed text
     */
    async transcribeAudio(audioInput: string | Express.Multer.File): Promise<string> {
        if (!this.openai) {
            if (config.NODE_ENV === 'development') {
                this.logger.warn('OpenAI not configured. Returning placeholder transcription.');
            }
            return '[Transcription unavailable - OpenAI API key not configured]';
        }

        const timeoutMs = config.OPENAI_REQUEST_TIMEOUT_MS;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        try {
            let audioBuffer: Buffer;
            let contentType: string;
            let fileExtension: string;

            if (typeof audioInput === 'string') {
                if (config.NODE_ENV === 'development') {
                    this.logger.log(`Starting transcription for audio URL: ${audioInput}`);
                }
                const response = await fetch(audioInput, { signal: abortController.signal });
                if (!response.ok) {
                    throw new Error(`Failed to fetch audio file: ${response.status} ${response.statusText}`);
                }

                audioBuffer = Buffer.from(await response.arrayBuffer());
                contentType = response.headers.get('content-type') || 'audio/mpeg';
                fileExtension = this.getFileExtensionFromContentType(contentType);
            } else {
                if (config.NODE_ENV === 'development') {
                    this.logger.log(`Starting transcription for audio file: ${audioInput.originalname || 'audio'}`);
                }
                
                if (!audioInput.buffer || audioInput.buffer.length === 0) {
                    throw new Error('Audio file buffer is empty or invalid');
                }
                
                audioBuffer = Buffer.isBuffer(audioInput.buffer)
                    ? audioInput.buffer
                    : Buffer.from(audioInput.buffer);
                
                contentType = audioInput.mimetype || 'audio/mpeg';
                fileExtension = this.getFileExtensionFromContentType(contentType, audioInput.originalname);
            }
            
            if (config.NODE_ENV === 'development') {
                this.logger.debug(`Processing audio file, Size: ${audioBuffer.length} bytes, Type: ${contentType}`);
            }

            // Validate buffer size (OpenAI has limits)
            if (audioBuffer.length === 0) {
                throw new Error('Audio buffer is empty');
            }
            if (audioBuffer.length > 25 * 1024 * 1024) { // 25MB limit for Whisper API
                throw new Error(`Audio file too large: ${audioBuffer.length} bytes (max 25MB)`);
            }

            // Use OpenAI Whisper API for transcription
            const model = config.OPENAI_TRANSCRIPTION_MODEL;
            if (config.NODE_ENV === 'development') {
                this.logger.debug(`Transcribing with model: ${model}`);
            }
            
            const fileName = `audio.${fileExtension}`;
            
            // Convert Buffer to Uint8Array for better compatibility with toFile
            // toFile can accept Buffer, but converting to Uint8Array ensures compatibility
            const uint8Array = new Uint8Array(audioBuffer);
            
            // Create File object from buffer
            const audioFile = await toFile(uint8Array, fileName, {
                type: contentType,
            });

            if (config.NODE_ENV === 'development') {
                this.logger.debug(`Created file object: ${fileName}, size: ${audioBuffer.length} bytes, type: ${contentType}`);
            }

            const transcription = await this.openai.audio.transcriptions.create(
                {
                    file: audioFile,
                    model: model,
                    language: 'en',
                },
                { signal: abortController.signal },
            );

            const transcribedText = transcription.text;
            if (config.NODE_ENV === 'development') {
                this.logger.log(`Transcription completed. Length: ${transcribedText.length} characters`);
            }

            return transcribedText;
        } catch (error) {
            this.logger.error(`Error transcribing audio: ${error.message}`, error.stack);

            const message = error?.message ?? 'Unknown error occurred';
            const errorDetails = (error as any)?.response?.data ?? message;

            if (message.includes('404') || message.includes('Invalid URL')) {
                throw new Error(
                    `Failed to transcribe audio: Invalid file format or API error. Please ensure the audio file is in a supported format (mp3, wav, m4a, webm, ogg). Original error: ${errorDetails}`,
                    { cause: error },
                );
            }

            if (message.includes('file_size_exceeded') || message.includes('too large')) {
                throw new Error(`Failed to transcribe audio: File is too large. Maximum size is 25MB. Original error: ${message}`, {
                    cause: error,
                });
            }

            throw new Error(`Failed to transcribe audio: ${message}`, { cause: error });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Get file extension from content type and optional original filename.
     */
    private getFileExtensionFromContentType(contentType: string, originalName?: string): string {
        if (contentType.includes('wav')) return 'wav';
        if (contentType.includes('ogg')) return 'ogg';
        if (contentType.includes('m4a')) return 'm4a';
        if (contentType.includes('webm')) return 'webm';
        if (originalName) {
            const ext = originalName.split('.').pop()?.toLowerCase();
            if (ext && ['wav', 'ogg', 'm4a', 'webm', 'mp3'].includes(ext)) return ext;
        }
        return 'mp3';
    }
}

