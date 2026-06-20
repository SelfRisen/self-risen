import { IsString, IsNotEmpty, MaxLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PERSONA_NAMES } from '../../reflection/constants/persona.constants';

export class EditAffirmationDto {
    @ApiProperty({
        description: 'The edited affirmation text (replaces the AI-generated affirmation)',
        example: 'I am capable of managing my finances with calm and clarity.',
        required: true,
        maxLength: 500,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    affirmation: string;

    @ApiProperty({
        required: false,
        type: 'string',
        enum: PERSONA_NAMES,
        enumName: 'PersonaName',
        description: 'Optional voice for this affirmation. If provided, regenerated audio will use this voice and it is stored on the affirmation without changing the user\'s default.',
    })
    @IsOptional()
    @IsString()
    @IsIn([...PERSONA_NAMES])
    voicePreference?: string;
}
