import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { PERSONA_NAMES } from 'src/reflection/constants/persona.constants';

export class VoicePreferenceDto {
    @ApiProperty({
        required: false,
        type: 'string',
        enum: PERSONA_NAMES,
        enumName: 'PersonaName',
        description: 'Optional voice persona for this affirmation. If not provided, uses user\'s default preference. This is stored on the affirmation so it keeps this voice even if the user changes their default.',
    })
    @IsOptional()
    @IsString()
    @IsIn([...PERSONA_NAMES])
    voicePreference?: string;
}
