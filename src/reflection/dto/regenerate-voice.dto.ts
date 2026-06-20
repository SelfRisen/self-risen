import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { PERSONA_NAMES } from '../constants/persona.constants';

export class RegenerateVoiceDto {
    @ApiProperty({
        required: false,
        type: 'string',
        enum: PERSONA_NAMES,
        enumName: 'PersonaName',
        description: 'Optional voice persona name for regeneration. If not provided, uses affirmation\'s or user\'s saved preference.\n\n' +
                     '**Available personas:** Sage (Empathetic Mentor), Phoenix (Energetic Motivator), River (Confident Coach), Quinn (Friendly Guide), Alex (Calm Companion), Robin (Wise Advisor).',
        example: 'Sage'
    })
    @IsOptional()
    @IsString()
    @IsIn([...PERSONA_NAMES])
    voicePreference?: string;
}

