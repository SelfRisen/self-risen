import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PERSONA_NAMES } from 'src/reflection/constants/persona.constants';

export class GeneratePersonaTtsDto {
  @ApiProperty({
    description: 'Text to convert to speech',
    example: 'I am capable, confident, and ready for today.',
    maxLength: 4096,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text: string;

  @ApiProperty({
    type: 'string',
    enum: PERSONA_NAMES,
    enumName: 'PersonaName',
    description:
      'Voice persona for TTS. Options: Sage (Empathetic Mentor), Phoenix (Energetic Motivator), River (Confident Coach), Quinn (Friendly Guide), Alex (Calm Companion), Robin (Wise Advisor).',
    example: 'Sage',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([...PERSONA_NAMES])
  voice: string;
}
