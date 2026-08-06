jest.mock('src/common/config', () => ({
  config: { FFMPEG_PATH: undefined },
}));

import { AudioMergeService } from '../audio-merge.service';

jest.mock('fluent-ffmpeg', () => {
  const mockCommand = {
    input: jest.fn().mockReturnThis(),
    inputOptions: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    audioFrequency: jest.fn().mockReturnThis(),
    audioChannels: jest.fn().mockReturnThis(),
    complexFilter: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    format: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    on: jest.fn(function (this: any, event: string, cb: () => void) {
      if (event === 'end') setImmediate(cb);
      return this;
    }),
    run: jest.fn(),
  };

  const ffmpegFn = jest.fn(() => mockCommand);
  (ffmpegFn as any).setFfmpegPath = jest.fn();
  (ffmpegFn as any).ffprobe = jest.fn(
    (
      _path: string,
      cb: (err: null, data: { format: { duration: number } }) => void,
    ) => {
      cb(null, { format: { duration: 120 } });
    },
  );

  return { __esModule: true, default: ffmpegFn };
});

describe('AudioMergeService', () => {
  let service: AudioMergeService;

  beforeEach(() => {
    service = new AudioMergeService();
  });

  it('probeDurationSeconds returns ffprobe duration', async () => {
    const duration = await service.probeDurationSeconds('/tmp/test.mp3');
    expect(duration).toBe(120);
  });

  // Skipping between affirmations has nothing to aim at without these, and
  // the merged file carries no marks saying where one ends.
  describe('affirmation offsets', () => {
    it('are the running total of each input, first at zero', async () => {
      jest
        .spyOn(service, 'probeDurationSeconds')
        .mockResolvedValueOnce(4) // a.mp3
        .mockResolvedValueOnce(6) // b.mp3
        .mockResolvedValueOnce(5) // c.mp3
        .mockResolvedValue(60); // concat + final probes

      const result = await service.mergeLoopAudio(
        ['/tmp/a.mp3', '/tmp/b.mp3', '/tmp/c.mp3'],
        '/tmp/bg.mp3',
        '/tmp/out.mp3',
        120,
      );

      expect(result.affirmationOffsets).toEqual([0, 4, 10]);
      expect(result.durationSeconds).toBe(60);
    });

    it('gives a single affirmation one offset at zero', async () => {
      jest.spyOn(service, 'probeDurationSeconds').mockResolvedValue(30);

      const result = await service.mergeLoopAudio(
        ['/tmp/only.mp3'],
        '/tmp/bg.mp3',
        '/tmp/out.mp3',
        120,
      );

      expect(result.affirmationOffsets).toEqual([0]);
    });

    it('drops offsets past the end rather than pointing nowhere', async () => {
      // The loop is capped shorter than the speech that went into it, so the
      // later affirmations do not exist in the output.
      jest
        .spyOn(service, 'probeDurationSeconds')
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(5)
        .mockResolvedValue(8);

      const result = await service.mergeLoopAudio(
        ['/tmp/a.mp3', '/tmp/b.mp3', '/tmp/c.mp3'],
        '/tmp/bg.mp3',
        '/tmp/out.mp3',
        8,
      );

      expect(result.affirmationOffsets).toEqual([0, 4]);
    });

    it('stops at an unreadable file instead of reporting wrong positions', async () => {
      jest
        .spyOn(service, 'probeDurationSeconds')
        .mockResolvedValueOnce(4)
        .mockRejectedValueOnce(new Error('ffprobe failed'))
        .mockResolvedValue(60);

      const result = await service.mergeLoopAudio(
        ['/tmp/a.mp3', '/tmp/bad.mp3', '/tmp/c.mp3'],
        '/tmp/bg.mp3',
        '/tmp/out.mp3',
        120,
      );

      // Everything after the bad file would be misplaced, so it is not
      // offered -- a wrong skip point is worse than a missing one.
      expect(result.affirmationOffsets).toEqual([0, 4]);
    });
  });

  it('mergeLoopAudio runs concat and mix without loudnorm in filter', async () => {
    const ffmpeg = require('fluent-ffmpeg').default;
    const mockCommand = ffmpeg();

    jest.spyOn(service, 'probeDurationSeconds').mockResolvedValue(60);

    await service.mergeLoopAudio(
      ['/tmp/a.mp3', '/tmp/b.mp3'],
      '/tmp/bg.mp3',
      '/tmp/out.mp3',
      120,
    );

    expect(mockCommand.complexFilter).toHaveBeenCalledWith(
      expect.stringMatching(/volume=0\.25.*afade=t=out/),
    );
    expect(mockCommand.complexFilter).toHaveBeenCalledWith(
      expect.not.stringContaining('loudnorm'),
    );
    // Background must outlast the affirmations track so the closing fade
    // covers music only -- the mix runs 4s past the 60s of speech, with the
    // 3s fade starting inside that music-only tail.
    expect(mockCommand.complexFilter).toHaveBeenCalledWith(
      expect.stringContaining('duration=longest'),
    );
    expect(mockCommand.complexFilter).toHaveBeenCalledWith(
      expect.stringContaining('afade=t=out:st=61:d=3'),
    );
    expect(mockCommand.outputOptions).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('loudnorm')]),
    );
    expect(mockCommand.outputOptions).toHaveBeenCalledWith(
      expect.arrayContaining(['-t', '64']),
    );
    expect(mockCommand.outputOptions).toHaveBeenCalledWith(
      expect.arrayContaining(['-ac', '2']),
    );
  });
});
