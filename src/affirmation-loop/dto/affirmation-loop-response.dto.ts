import { ApiProperty } from '@nestjs/swagger';
import { AffirmationLoopStatus, TtsVoicePreference } from '@prisma/client';

export class AffirmationLoopResponseDto {
  @ApiProperty({ example: '22c31e61-2308-4a3a-a36a-3cff5947cb74' })
  id: string;

  @ApiProperty({
    enum: AffirmationLoopStatus,
    description:
      'Loop lifecycle status. PROCESSING while audio is merging; poll GET :id until READY or FAILED.',
    example: AffirmationLoopStatus.PROCESSING,
  })
  status: AffirmationLoopStatus;

  @ApiProperty({
    description:
      'Signed URL to the merged loop MP3 (1h expiry). Present only when status is READY.',
    required: false,
    nullable: true,
    example:
      'https://example.supabase.co/storage/v1/object/sign/uploads/loops/user/loop.mp3',
  })
  audioUrl?: string | null;

  @ApiProperty({
    description:
      'Target loop duration in seconds from creation. After merge completes (READY), reflects the actual output length.',
    required: false,
    nullable: true,
    example: 180,
  })
  durationSeconds?: number | null;

  @ApiProperty({
    description:
      'Background music key from GET /stater-videos/music (name field)',
    example: 'meditation',
  })
  backgroundMusicKey: string;

  @ApiProperty({
    required: false,
    nullable: true,
    enum: TtsVoicePreference,
    description: 'Voice used for affirmations in this loop',
  })
  voicePreference?: TtsVoicePreference | null;

  @ApiProperty({
    type: [String],
    description: 'Affirmation IDs in playback order',
    example: [
      '50cc4397-1525-4819-b582-632e2820f952',
      'a033142f-962d-4b49-915c-d7e4a73bac75',
    ],
  })
  affirmationIds: string[];

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Error detail when status is FAILED',
    example: 'ffmpeg error: ...',
  })
  errorMessage?: string | null;

  @ApiProperty({ example: '2026-05-19T20:31:01.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-19T20:31:23.000Z' })
  updatedAt: Date;
}
