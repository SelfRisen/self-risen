jest.mock('src/common', () => ({
    BaseService: class BaseService {},
    logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AffirmationLoopStatus } from '@prisma/client';
import { AudioMergeProcessor } from '../audio-merge.processor';
import { DatabaseProvider } from 'src/database/database.provider';
import { StorageService } from 'src/common/storage/storage.service';
import { StaterVideosService } from 'src/stater-videos/stater-videos.service';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';
import { AudioMergeService } from '../audio-merge.service';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';

describe('AudioMergeProcessor', () => {
    let processor: AudioMergeProcessor;
    let mockPrisma: any;
    let mockTts: any;
    let mockMerge: any;
    let mockStorage: any;

    const baseLoop = {
        id: 'loop-1',
        userId: 'user-1',
        durationSeconds: 180,
        backgroundMusicKey: 'meditation',
        voicePreference: 'FEMALE_EMPATHETIC' as const,
        items: [
            {
                sortOrder: 0,
                affirmation: {
                    id: 'aff-1',
                    affirmationText: 'I am strong',
                    audioUrl: 'https://audio.test/old.mp3',
                    ttsVoicePreference: 'MALE_CONFIDENT' as const,
                },
            },
        ],
        user: { id: 'user-1' },
    };

    beforeEach(async () => {
        mockTts = {
            generateAffirmationAudio: jest.fn().mockResolvedValue('https://audio.test/new.mp3'),
        };

        mockMerge = {
            createTempDir: jest.fn().mockReturnValue('/tmp/audio-merge-loop-1'),
            mergeLoopAudio: jest.fn().mockResolvedValue(90),
            cleanupTempDir: jest.fn(),
        };

        mockStorage = {
            downloadToFile: jest.fn().mockResolvedValue(undefined),
            uploadBufferAtPath: jest.fn().mockResolvedValue({
                path: 'loops/user-1/loop-1.mp3',
                url: 'https://signed.test/loop.mp3',
            }),
        };

        mockPrisma = {
            affirmationLoop: {
                findUnique: jest.fn().mockResolvedValue(baseLoop),
                update: jest.fn().mockResolvedValue({}),
            },
            affirmation: {
                update: jest.fn().mockResolvedValue({}),
            },
            user: {
                update: jest.fn().mockResolvedValue({}),
            },
            $transaction: jest.fn().mockResolvedValue([]),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AudioMergeProcessor,
                { provide: DatabaseProvider, useValue: mockPrisma },
                { provide: StorageService, useValue: mockStorage },
                {
                    provide: StaterVideosService,
                    useValue: {
                        getSoundByName: jest.fn().mockReturnValue({
                            url: 'https://music.test/bg.mp3',
                            name: 'meditation',
                        }),
                    },
                },
                { provide: TextToSpeechService, useValue: mockTts },
                { provide: AudioMergeService, useValue: mockMerge },
                {
                    provide: INotificationService,
                    useValue: { notifyUser: jest.fn().mockResolvedValue({}) },
                },
            ],
        }).compile();

        processor = module.get(AudioMergeProcessor);

        jest.spyOn(require('fs/promises'), 'readFile').mockResolvedValue(Buffer.from('mp3'));
    });

    it('re-TTS when loop requests voice different from affirmation', async () => {
        mockPrisma.affirmationLoop.findUnique.mockResolvedValue({
            ...baseLoop,
            voicePreference: 'FEMALE_EMPATHETIC',
        });
        const job = {
            data: { loopId: 'loop-1' },
            opts: { attempts: 2 },
            attemptsMade: 2,
        } as any;

        await processor.handleMerge(job);

        expect(mockTts.generateAffirmationAudio).toHaveBeenCalled();
        expect(mockMerge.mergeLoopAudio).toHaveBeenCalledWith(
            expect.any(Array),
            expect.any(String),
            expect.any(String),
            180,
        );
        expect(mockPrisma.affirmationLoop.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'loop-1' },
                data: expect.objectContaining({
                    status: AffirmationLoopStatus.READY,
                    durationSeconds: 90,
                }),
            }),
        );
    });

    it('refunds token on final failure', async () => {
        mockPrisma.affirmationLoop.findUnique.mockResolvedValue({
            userId: 'user-1',
            status: AffirmationLoopStatus.PROCESSING,
        });

        const job = {
            data: { loopId: 'loop-1' },
            opts: { attempts: 2 },
            attemptsMade: 2,
        } as any;

        await processor.onFailed(job, new Error('ffmpeg failed'));

        expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('does not refund on non-final attempt', async () => {
        const job = {
            data: { loopId: 'loop-1' },
            opts: { attempts: 2 },
            attemptsMade: 1,
        } as any;

        await processor.onFailed(job, new Error('retry'));

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
});
