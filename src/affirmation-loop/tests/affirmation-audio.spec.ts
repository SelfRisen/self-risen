import { audioUrlFor } from '../affirmation-audio';

describe('audioUrlFor', () => {
  it("uses the user's own recording when there is one", () => {
    // Recording yourself and then hearing a synthetic voice back is the
    // feature not working.
    expect(
      audioUrlFor({ userAudioUrl: 'mine.mp3', audioUrl: 'generated.mp3' }),
    ).toBe('mine.mp3');
  });

  it('falls back to the generated speech', () => {
    expect(audioUrlFor({ userAudioUrl: null, audioUrl: 'generated.mp3' })).toBe(
      'generated.mp3',
    );
  });

  it('reports nothing when neither exists, so the caller can fail loudly', () => {
    expect(audioUrlFor({ userAudioUrl: null, audioUrl: null })).toBeNull();
    expect(audioUrlFor({})).toBeNull();
  });
});
