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
    (ffmpegFn as any).ffprobe = jest.fn((_path: string, cb: (err: null, data: { format: { duration: number } }) => void) => {
        cb(null, { format: { duration: 120 } });
    });

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

    it('mergeLoopAudio runs concat and mix without loudnorm in filter', async () => {
        const ffmpeg = require('fluent-ffmpeg').default;
        const mockCommand = ffmpeg();

        jest.spyOn(service, 'probeDurationSeconds').mockResolvedValue(60);

        await service.mergeLoopAudio(
            ['/tmp/a.mp3', '/tmp/b.mp3'],
            '/tmp/bg.mp3',
            '/tmp/out.mp3',
        );

        expect(mockCommand.complexFilter).toHaveBeenCalledWith(
            expect.stringMatching(/volume=0\.25.*afade=t=out/),
        );
        expect(mockCommand.complexFilter).toHaveBeenCalledWith(
            expect.not.stringContaining('loudnorm'),
        );
        expect(mockCommand.outputOptions).not.toHaveBeenCalledWith(
            expect.arrayContaining(['-af']),
        );
        expect(mockCommand.outputOptions).toHaveBeenCalledWith(
            expect.arrayContaining(['-ac', '2']),
        );
    });
});
