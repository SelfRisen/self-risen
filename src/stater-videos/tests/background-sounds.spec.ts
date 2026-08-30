import { StaterVideosService } from '../stater-videos.service';

describe('background sounds', () => {
  // The sound list is static data; the collaborators are irrelevant to it.
  const service = new StaterVideosService(
    {} as never,
    {} as never,
    {} as never,
  );

  const offered = () => (service.getMusicUrls() as any).data as
    { name: string }[];

  it('offers only the tracks with a name and description from the PO', () => {
    expect(offered().map((s) => s.name)).toEqual([
      'Uplifting Alpha waves 8-12 Hz',
      'Dreamy Beta waves 12-30 Hz',
      'Rejuvenate Alpha waves 8-12 Hz',
      'Theta brainwaves 4-8 Hz',
      'Cinematic Piano Beta waves 12-30 Hz',
    ]);
  });

  it('does not offer a track that was never matched to one', () => {
    expect(offered().map((s) => s.name)).not.toContain('Ambient Piano');
  });

  describe('getSoundByName', () => {
    it('finds a track that is offered', () => {
      expect(service.getSoundByName('Theta brainwaves 4-8 Hz')?.url).toContain(
        'Theta%20Meditation',
      );
    });

    it('still finds a track by the name it used to have', () => {
      // A loop stores the name it was built with; a rename must not orphan it.
      const sound = service.getSoundByName('Theta Meditation');
      expect(sound?.name).toBe('Theta brainwaves 4-8 Hz');
    });

    it('still finds a track that is no longer offered', () => {
      // Withdrawn from the picker, but loops built with it still cook.
      expect(service.getSoundByName('Ambient Piano')?.url).toContain(
        'Ambient%20Piano',
      );
    });

    it('reports nothing for a name that never existed', () => {
      expect(service.getSoundByName('Not A Track')).toBeNull();
    });
  });
});
