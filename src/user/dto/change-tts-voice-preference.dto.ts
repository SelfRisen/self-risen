import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsIn } from 'class-validator';
import { PERSONA_NAMES } from '../../reflection/constants/persona.constants';

export class ChangeTtsVoicePreferenceDto {
  @ApiProperty({
    required: true,
    type: 'string',
    enum: PERSONA_NAMES,
    enumName: 'PersonaName',
    description:
      'Voice persona name for text-to-speech affirmations. Available: Sage (Empathetic Mentor), Phoenix (Energetic Motivator), River (Confident Coach), Quinn (Friendly Guide), Alex (Calm Companion), Robin (Wise Advisor).',
    example: 'Sage',
  })
  @IsNotEmpty()
  @IsString()
  @IsIn([...PERSONA_NAMES])
  ttsVoicePreference: string;
}
