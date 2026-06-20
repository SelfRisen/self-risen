import { ApiProperty } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
} from 'class-validator';
import { MAX_LOOP_DURATION_SECONDS } from '../audio-merge.service';

export class CreateAffirmationLoopDto {
    @ApiProperty({
        description: 'Affirmation IDs in playback order',
        type: [String],
        minItems: 1,
        maxItems: 20,
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @IsUUID('4', { each: true })
    affirmationIds: string[];

    @ApiProperty({
        description:
            'Background music name from GET /stater-videos/music (must match a list item name exactly)',
        example: 'meditation',
    })
    @IsString()
    @IsNotEmpty()
    backgroundMusicKey: string;

    @ApiProperty({
        description: 'Target loop duration in seconds (1–300). The merged audio is capped at this length.',
        example: 180,
        minimum: 1,
        maximum: MAX_LOOP_DURATION_SECONDS,
    })
    @IsInt()
    @Min(1)
    @Max(MAX_LOOP_DURATION_SECONDS)
    durationSeconds: number;

    @ApiProperty({
        description:
            'Optional TTS voice persona for affirmations missing audio or with a different voice. Accepts a persona name (e.g. Sage).',
        required: false,
        example: 'Sage',
    })
    @IsOptional()
    @IsString()
    voicePreference?: string;
}
