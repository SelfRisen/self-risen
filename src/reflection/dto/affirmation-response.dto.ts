import { ApiProperty } from '@nestjs/swagger';
import { TtsVoicePreference } from '@prisma/client';
import { PERSONA_NAMES } from '../constants/persona.constants';

export class AffirmationResponseDto {
    @ApiProperty({
        description: 'Unique identifier of the affirmation',
        example: 'affirmation-id-123',
    })
    id: string;

    @ApiProperty({
        description: 'ID of the reflection session this affirmation belongs to',
        example: 'session-id-123',
    })
    sessionId: string;

    @ApiProperty({
        description: 'The affirmation text',
        example: 'I am worthy of abundance and success in all areas of my life.',
    })
    affirmationText: string;

    @ApiProperty({
        description: 'URL to the generated audio for this affirmation',
        example: 'https://storage.example.com/affirmations/audio-123.mp3',
        required: false,
        nullable: true,
    })
    audioUrl?: string | null;

    @ApiProperty({
        description: 'Whether this affirmation is selected as the active one for this session',
        example: true,
    })
    isSelected: boolean;

    @ApiProperty({
        description: 'Order of this affirmation in the list',
        example: 0,
    })
    order: number;

    @ApiProperty({
        description: 'Voice persona used for this affirmation (persisted per affirmation; does not change if user changes default)',
        enum: PERSONA_NAMES,
        required: false,
        nullable: true,
        example: 'Sage',
    })
    ttsVoicePreference?: TtsVoicePreference | null;

    @ApiProperty({
        description: 'Timestamp when the affirmation was created',
        example: '2024-01-15T10:30:00.000Z',
    })
    createdAt: Date;

    @ApiProperty({
        description: 'Timestamp when the affirmation was last updated',
        example: '2024-01-15T10:30:00.000Z',
    })
    updatedAt: Date;
}
