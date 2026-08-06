jest.mock('src/common', () => ({
  BaseService: class BaseService {
    Results(data: unknown) {
      return { isError: false, data };
    }
    HandleError(error: unknown) {
      return { isError: true, error };
    }
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { AffirmationLoopStatus } from '@prisma/client';
import { AffirmationLoopService } from '../affirmation-loop.service';
import { DatabaseProvider } from 'src/database/database.provider';
import { StorageService } from 'src/common/storage/storage.service';
import { StaterVideosService } from 'src/stater-videos/stater-videos.service';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';

describe('AffirmationLoopService', () => {
  let service: AffirmationLoopService;
  let mockPrisma: any;
  let mockQueue: any;
  let mockStaterVideos: any;

  const mockUser = {
    id: 'user-1',
    firebaseId: 'fb-1',
    loopTokensRemaining: 5,
    ttsVoicePreference: null,
  };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    mockStaterVideos = {
      getSoundByName: jest.fn().mockReturnValue({
        url: 'https://music.test/bg.mp3',
        name: 'meditation',
      }),
    };

    mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
        update: jest.fn(),
      },
      affirmation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'aff-1',
            affirmationText: 'I am capable',
          },
        ]),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          user: {
            update: jest
              .fn()
              .mockResolvedValue({ ...mockUser, loopTokensRemaining: 4 }),
          },
          affirmationLoop: {
            create: jest.fn().mockResolvedValue({
              id: 'loop-1',
              status: AffirmationLoopStatus.PROCESSING,
              audioPath: null,
              durationSeconds: 180,
              backgroundMusicKey: 'meditation',
              voicePreference: null,
              errorMessage: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              items: [{ affirmationId: 'aff-1', sortOrder: 0 }],
            }),
          },
        };
        return fn(tx);
      }),
      affirmationLoop: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AffirmationLoopService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        {
          provide: StorageService,
          useValue: { getSignedUrl: jest.fn(), deleteFile: jest.fn() },
        },
        { provide: StaterVideosService, useValue: mockStaterVideos },
        {
          provide: TextToSpeechService,
          useValue: { convertNameToEnum: jest.fn() },
        },
        { provide: getQueueToken('audio_merge'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(AffirmationLoopService);
  });

  it('should reject when no tokens remaining', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      loopTokensRemaining: 0,
    });

    const result = await service.createLoop('fb-1', {
      affirmationIds: ['aff-1'],
      backgroundMusicKey: 'meditation',
      durationSeconds: 180,
    });

    expect(result.isError).toBe(true);
    expect(result.error).toBeInstanceOf(HttpException);
    expect((result.error as HttpException).getStatus()).toBe(402);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should reject unknown background music', async () => {
    mockStaterVideos.getSoundByName.mockReturnValue(null);

    const result = await service.createLoop('fb-1', {
      affirmationIds: ['aff-1'],
      backgroundMusicKey: 'unknown',
      durationSeconds: 180,
    });

    expect(result.isError).toBe(true);
    expect(result.error).toBeInstanceOf(BadRequestException);
  });

  it('should reject affirmations not owned by user', async () => {
    mockPrisma.affirmation.findMany.mockResolvedValue([]);

    const result = await service.createLoop('fb-1', {
      affirmationIds: ['aff-missing'],
      backgroundMusicKey: 'meditation',
      durationSeconds: 180,
    });

    expect(result.isError).toBe(true);
    expect(result.error).toBeInstanceOf(BadRequestException);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should debit token, create loop, and enqueue job', async () => {
    const result = await service.createLoop('fb-1', {
      affirmationIds: ['aff-1'],
      backgroundMusicKey: 'meditation',
      durationSeconds: 180,
    });

    expect(result.isError).toBe(false);
    expect(result.data?.durationSeconds).toBe(180);
    expect(result.data?.status).toBe(AffirmationLoopStatus.PROCESSING);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalledWith('merge_loop', {
      loopId: 'loop-1',
    });
  });

  it('should return 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await service.getLoopById('fb-1', 'loop-1');
    expect(result.isError).toBe(true);
    expect(result.error).toBeInstanceOf(NotFoundException);
  });

  // waveSessionId is derived from the items' affirmations rather than stored,
  // so a query that forgets the relation returns null instead of failing. That
  // null is what ties a loop to its wave, so losing it silently stops practice
  // being counted. These pin the relation to every read.
  describe('waveSessionId', () => {
    const loopRow = (sessionId: string | null) => ({
      id: 'loop-1',
      status: AffirmationLoopStatus.READY,
      audioPath: 'loops/loop-1.mp3',
      name: 'Morning Abundance',
      description: null,
      durationSeconds: 180,
      backgroundMusicKey: 'meditation',
      voicePreference: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          affirmationId: 'aff-1',
          sortOrder: 0,
          ...(sessionId ? { affirmation: { sessionId } } : {}),
        },
      ],
    });

    it('is returned by listLoops, not just by getLoopById', async () => {
      mockPrisma.affirmationLoop.count.mockResolvedValue(1);
      mockPrisma.affirmationLoop.findMany.mockResolvedValue([
        loopRow('session-9'),
      ]);

      const result = await service.listLoops('fb-1', 1, 10);

      expect(result.isError).toBe(false);
      expect(result.data?.data[0].waveSessionId).toBe('session-9');
    });

    it('loads the affirmation relation when listing', async () => {
      mockPrisma.affirmationLoop.count.mockResolvedValue(0);
      mockPrisma.affirmationLoop.findMany.mockResolvedValue([]);

      await service.listLoops('fb-1', 1, 10);

      expect(mockPrisma.affirmationLoop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            items: expect.objectContaining({
              include: { affirmation: { select: { sessionId: true } } },
            }),
          }),
        }),
      );
    });

    it('is returned by updateLoop, which used to hand back the raw row', async () => {
      mockPrisma.affirmationLoop.findUnique.mockResolvedValue(loopRow(null));
      mockPrisma.affirmationLoop.update.mockResolvedValue(loopRow('session-9'));

      const result = await service.updateLoop('fb-1', 'loop-1', {
        name: 'Renamed',
        backgroundMusicKey: 'meditation',
        durationSeconds: 180,
      });

      expect(result.isError).toBe(false);
      expect(result.data?.waveSessionId).toBe('session-9');
      expect(result.data?.affirmationIds).toEqual(['aff-1']);
    });

    it('is null when a loop spans more than one session', async () => {
      const row = loopRow('session-9');
      row.items.push({
        affirmationId: 'aff-2',
        sortOrder: 1,
        affirmation: { sessionId: 'session-other' },
      });
      mockPrisma.affirmationLoop.count.mockResolvedValue(1);
      mockPrisma.affirmationLoop.findMany.mockResolvedValue([row]);

      const result = await service.listLoops('fb-1', 1, 10);

      expect(result.data?.data[0].waveSessionId).toBeNull();
    });
  });
});
