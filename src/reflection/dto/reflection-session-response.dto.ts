import { ApiProperty } from '@nestjs/swagger';
import { AffirmationResponseDto } from './affirmation-response.dto';

export class ReflectionSoundResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  soundUrl: string;

  @ApiProperty({ required: false, nullable: true })
  name?: string | null;

  @ApiProperty({ required: false, nullable: true })
  fileSize?: number | null;

  @ApiProperty({ required: false, nullable: true })
  mimeType?: string | null;
}

export class ReflectionSessionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  categoryId: string;

  @ApiProperty({ required: false })
  wheelFocusId?: string;

  @ApiProperty()
  prompt: string;

  @ApiProperty({ required: false })
  rawBeliefText?: string;

  @ApiProperty({ required: false })
  audioUrl?: string;

  @ApiProperty({ required: false })
  transcriptionText?: string;

  @ApiProperty({ required: false })
  limitingBelief?: string;

  @ApiProperty({
    required: false,
    description:
      'Text of the currently selected affirmation (snapshot on session)',
  })
  selectedAffirmationText?: string;

  @ApiProperty({
    required: false,
    description:
      'Set to true when the server overrides AI output due to a safety issue',
  })
  isSafetyOverride?: boolean;

  @ApiProperty({
    required: false,
    description:
      'User-visible message to display immediately (used for safety override responses)',
  })
  userMessage?: string;

  @ApiProperty({
    enum: ['PENDING', 'BELIEF_CAPTURED', 'AFFIRMATION_GENERATED', 'COMPLETED'],
  })
  status: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  completedAt?: Date;

  @ApiProperty({ required: false, description: 'Active wave for this session' })
  waves?: Array<{
    id: string;
    sessionId: string;
    startDate: Date;
    endDate: Date;
    durationDays: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;

  @ApiProperty({
    required: false,
    description: 'AI TTS URL for the currently selected affirmation',
  })
  selectedAffirmationAudioUrl?: string;

  @ApiProperty({ required: false })
  userAffirmationAudioUrl?: string;

  @ApiProperty({ required: false })
  playbackCount?: number;

  @ApiProperty({ required: false })
  lastPlayedAt?: Date;

  @ApiProperty({ required: false })
  beliefRerecordedAt?: Date;

  @ApiProperty({ required: false })
  beliefRerecordCount?: number;

  @ApiProperty({
    required: false,
    description:
      'Computed field - priority audio URL (user recording > AI TTS)',
  })
  affirmationAudioUrl?: string;

  @ApiProperty({ required: false })
  category?: {
    id: string;
    name: string;
  };

  @ApiProperty({
    required: false,
    type: [AffirmationResponseDto],
    description: 'List of all affirmations generated for this session',
  })
  affirmations?: AffirmationResponseDto[];

  @ApiProperty({
    required: false,
    description: 'Reflection session sound (1:1)',
    type: () => ReflectionSoundResponseDto,
  })
  reflectionSound?: ReflectionSoundResponseDto;
}
