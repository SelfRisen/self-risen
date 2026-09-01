/**
 * The audio to use for an affirmation.
 *
 * A recording the user made of themselves reading it wins over the generated
 * speech. Making a recording and then hearing a synthetic voice back is the
 * feature not working.
 */
export const audioUrlFor = (affirmation: {
  userAudioUrl?: string | null;
  audioUrl?: string | null;
}): string | null => affirmation.userAudioUrl ?? affirmation.audioUrl ?? null;
