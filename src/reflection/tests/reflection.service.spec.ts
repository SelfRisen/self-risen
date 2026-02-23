import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReflectionService } from '../reflection.service';
import { DatabaseProvider } from '../../database/database.provider';
import { StorageService } from '../../common/storage/storage.service';
import { TranscriptionService } from '../services/transcription.service';
import { NlpTransformationService } from '../services/nlp-transformation.service';
import { TextToSpeechService } from '../services/text-to-speech.service';
import { INotificationService } from '../../notifications/interfaces/notification.interface';
import { TtsVoicePreference } from '@prisma/client';
import { StaterVideosService } from '../../stater-videos/stater-videos.service';

jest.mock('../../common', () => {
  const originalModule = jest.requireActual('../../common');
  return {
    ...originalModule,
    logger: {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
  };
});

describe('ReflectionService', () => {
  let service: ReflectionService;
  let mockPrisma: any;
  let mockStorageService: any;
  let mockTranscriptionService: any;
  let mockNlpTransformationService: any;
  let mockTextToSpeechService: any;
  let mockNotificationService: any;
  let mockStaterVideosService: any;

  const mockUser = {
    id: 'user-123',
    firebaseId: 'firebase-uid-123',
    email: 'test@example.com',
    name: 'Test User',
    ttsVoicePreference: TtsVoicePreference.MALE_CONFIDENT,
  };

  const mockCategory = {
    id: 'cat-1',
    name: 'Health & Well-being',
    wheel: { userId: 'user-123' },
  };

  const mockSession = {
    id: 'session-123',
    userId: 'user-123',
    categoryId: 'cat-1',
    prompt: 'My body is...',
    status: 'PENDING',
    rawBeliefText: null,
    limitingBelief: null,
    selectedAffirmationText: null,
    selectedAffirmationAudioUrl: null,
    userAffirmationAudioUrl: null,
    playbackCount: 0,
    beliefRerecordCount: 0,
    createdAt: new Date(),
    category: { id: 'cat-1', name: 'Health & Well-being' },
  };

  const mockWave = {
    id: 'wave-123',
    sessionId: 'session-123',
    startDate: new Date(),
    endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    durationDays: 20,
    isActive: true,
    session: { id: 'session-123', userId: 'user-123' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      wheelCategory: {
        findFirst: jest.fn(),
      },
      reflectionSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      reflectionSound: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      wave: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockStorageService = {
      uploadFile: jest.fn(),
    };

    mockTranscriptionService = {
      transcribeAudio: jest.fn(),
    };

    mockNlpTransformationService = {
      transformBelief: jest.fn(),
    };

    mockTextToSpeechService = {
      generateAffirmationAudio: jest.fn(),
    };

    mockNotificationService = {
      notifyUser: jest.fn(),
    };

    mockStaterVideosService = {
      getMusicByName: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReflectionService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
        { provide: TranscriptionService, useValue: mockTranscriptionService },
        { provide: NlpTransformationService, useValue: mockNlpTransformationService },
        { provide: TextToSpeechService, useValue: mockTextToSpeechService },
        { provide: INotificationService, useValue: mockNotificationService },
        { provide: StaterVideosService, useValue: mockStaterVideosService },
      ],
    }).compile();

    service = module.get<ReflectionService>(ReflectionService);
  });

  describe('createSession', () => {
    it('should successfully create a session', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.reflectionSession.create.mockResolvedValue(mockSession);

      const result = await service.createSession('firebase-uid-123', { categoryId: 'cat-1' });

      expect(result.isError).toBe(false);
      expect(result.data?.id).toBe('session-123');
      expect(result.data?.status).toBe('PENDING');
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createSession('nonexistent-firebase-id', { categoryId: 'cat-1' });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when category not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wheelCategory.findFirst.mockResolvedValue(null);

      const result = await service.createSession('firebase-uid-123', { categoryId: 'nonexistent-cat' });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('getSessionById', () => {
    it('should return session by id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(mockSession);

      const result = await service.getSessionById('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(false);
      expect(result.data?.id).toBe('session-123');
    });

    it('should return error when session not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(null);

      const result = await service.getSessionById('firebase-uid-123', 'nonexistent-session');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('createReflectionSound', () => {
    const mockMusic = { url: 'https://storage.com/sound.mp3', name: 'bright-glow' };
    const mockReflectionSound = {
      id: 'ref-sound-123',
      reflectionSessionId: 'session-123',
      soundUrl: mockMusic.url,
      name: mockMusic.name,
      fileSize: null,
      mimeType: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create reflection sound when session has none', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({ ...mockSession, reflectionSound: null });
      mockStaterVideosService.getMusicByName.mockReturnValue(mockMusic);
      mockPrisma.reflectionSound.create.mockResolvedValue(mockReflectionSound);

      const result = await service.createReflectionSound('firebase-uid-123', 'session-123', 'bright-glow');

      expect(result.isError).toBe(false);
      expect(mockStaterVideosService.getMusicByName).toHaveBeenCalledWith('bright-glow');
      expect(mockPrisma.reflectionSound.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reflectionSessionId: 'session-123',
          soundUrl: mockMusic.url,
          name: mockMusic.name,
        }),
      });
    });

    it('should replace reflection sound when session already has one', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockSession,
        reflectionSound: mockReflectionSound,
      });
      mockStaterVideosService.getMusicByName.mockReturnValue({ url: 'https://storage.com/new-sound.mp3', name: 'bright-glow' });
      mockPrisma.reflectionSound.update.mockResolvedValue({
        ...mockReflectionSound,
        soundUrl: 'https://storage.com/new-sound.mp3',
      });

      const result = await service.createReflectionSound('firebase-uid-123', 'session-123', 'bright-glow');

      expect(result.isError).toBe(false);
      expect(mockPrisma.reflectionSound.update).toHaveBeenCalled();
    });

    it('should return error when session not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(null);

      const result = await service.createReflectionSound('firebase-uid-123', 'nonexistent-session', 'bright-glow');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when sound name not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({ ...mockSession, reflectionSound: null });
      mockStaterVideosService.getMusicByName.mockReturnValue(null);

      const result = await service.createReflectionSound('firebase-uid-123', 'session-123', 'unknown-sound');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('getSoundForReflection', () => {
    it('should return sound when session has one', async () => {
      const mockReflectionSound = {
        id: 'ref-sound-123',
        soundUrl: 'https://storage.com/sound.mp3',
        name: 'ambient.mp3',
        fileSize: 1024,
        mimeType: 'audio/mpeg',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockSession,
        reflectionSound: mockReflectionSound,
      });

      const result = await service.getSoundForReflection('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(false);
      expect(result.data?.sound).toEqual(mockReflectionSound);
    });

    it('should return null sound when session has none', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({ ...mockSession, reflectionSound: null });

      const result = await service.getSoundForReflection('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(false);
      expect(result.data?.sound).toBeNull();
    });
  });

  describe('getAllSessions', () => {
    it('should return paginated sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.count.mockResolvedValue(15);
      mockPrisma.reflectionSession.findMany.mockResolvedValue([mockSession]);

      const result = await service.getAllSessions('firebase-uid-123', 1, 10);

      expect(result.isError).toBe(false);
      expect(result.data?.data).toBeDefined();
      expect(result.data?.pagination).toBeDefined();
      expect(result.data?.pagination.total).toBe(15);
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getAllSessions('nonexistent-firebase-id');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('submitBelief', () => {
    it('should successfully submit belief with text', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(mockSession);
      mockPrisma.reflectionSession.update.mockResolvedValue({
        ...mockSession,
        rawBeliefText: 'I am not healthy',
        status: 'BELIEF_CAPTURED',
      });

      const result = await service.submitBelief('firebase-uid-123', 'session-123', { text: 'I am not healthy' });

      expect(result.isError).toBe(false);
      expect(result.data?.status).toBe('BELIEF_CAPTURED');
    });

    it('should successfully submit belief with audio file', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(mockSession);
      mockTranscriptionService.transcribeAudio.mockResolvedValue('Transcribed text');
      mockPrisma.reflectionSession.update.mockResolvedValue({
        ...mockSession,
        rawBeliefText: 'Transcribed text',
        status: 'BELIEF_CAPTURED',
      });

      const mockAudioFile = { buffer: Buffer.from('audio'), mimetype: 'audio/mp3' } as Express.Multer.File;
      const result = await service.submitBelief('firebase-uid-123', 'session-123', {}, mockAudioFile);

      expect(result.isError).toBe(false);
      expect(mockTranscriptionService.transcribeAudio).toHaveBeenCalled();
    });

    it('should return error when session not in PENDING status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockSession,
        status: 'BELIEF_CAPTURED',
      });

      const result = await service.submitBelief('firebase-uid-123', 'session-123', { text: 'test' });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when neither text nor audio provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(mockSession);

      const result = await service.submitBelief('firebase-uid-123', 'session-123', {});

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('generateAffirmation', () => {
    const sessionWithBelief = {
      ...mockSession,
      status: 'BELIEF_CAPTURED',
      rawBeliefText: 'I am not healthy',
    };

    it('should successfully generate affirmation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(sessionWithBelief);
      mockNlpTransformationService.transformBelief.mockResolvedValue({
        limitingBelief: 'I am not healthy',
        generatedAffirmation: 'I am healthy and vibrant',
      });
      mockTextToSpeechService.generateAffirmationAudio.mockResolvedValue('https://audio-url.com/audio.mp3');
      mockPrisma.reflectionSession.update.mockResolvedValue({
        ...sessionWithBelief,
        status: 'AFFIRMATION_GENERATED',
        selectedAffirmationText: 'I am healthy and vibrant',
        category: mockCategory,
      });
      mockNotificationService.notifyUser.mockResolvedValue([]);

      const result = await service.generateAffirmation('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(false);
      expect(result.data?.status).toBe('AFFIRMATION_GENERATED');
    });

    it('should return error when session not in BELIEF_CAPTURED status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(mockSession);

      const result = await service.generateAffirmation('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when no belief text found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockSession,
        status: 'BELIEF_CAPTURED',
        rawBeliefText: '',
      });

      const result = await service.generateAffirmation('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('reRecordBelief', () => {
    const sessionWithBelief = {
      ...mockSession,
      status: 'BELIEF_CAPTURED',
      rawBeliefText: 'Old belief',
    };

    it('should successfully re-record belief', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(sessionWithBelief);
      mockPrisma.reflectionSession.update.mockResolvedValue({
        ...sessionWithBelief,
        rawBeliefText: 'New belief',
        beliefRerecordCount: 1,
      });

      const result = await service.reRecordBelief('firebase-uid-123', 'session-123', { text: 'New belief' });

      expect(result.isError).toBe(false);
      expect(result.data?.rawBeliefText).toBe('New belief');
    });

    it('should return error when session in PENDING status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(mockSession);

      const result = await service.reRecordBelief('firebase-uid-123', 'session-123', { text: 'New belief' });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('recordUserAffirmation', () => {
    const sessionWithAffirmation = {
      ...mockSession,
      status: 'AFFIRMATION_GENERATED',
      selectedAffirmationText: 'I am healthy',
    };

    it('should successfully record user affirmation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(sessionWithAffirmation);
      mockStorageService.uploadFile.mockResolvedValue({ url: 'https://storage.com/audio.mp3' });
      mockPrisma.reflectionSession.update.mockResolvedValue({
        ...sessionWithAffirmation,
        userAffirmationAudioUrl: 'https://storage.com/audio.mp3',
      });

      const mockAudioFile = { buffer: Buffer.from('audio'), mimetype: 'audio/mp3' } as Express.Multer.File;
      const result = await service.recordUserAffirmation('firebase-uid-123', 'session-123', mockAudioFile);

      expect(result.isError).toBe(false);
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
    });

    it('should return error when session not in correct status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(mockSession);

      const mockAudioFile = { buffer: Buffer.from('audio'), mimetype: 'audio/mp3' } as Express.Multer.File;
      const result = await service.recordUserAffirmation('firebase-uid-123', 'session-123', mockAudioFile);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('trackPlayback', () => {
    it('should successfully track playback', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(mockSession);
      mockPrisma.reflectionSession.update.mockResolvedValue({
        ...mockSession,
        playbackCount: 1,
        lastPlayedAt: new Date(),
      });

      const result = await service.trackPlayback('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(false);
      expect(result.data?.playbackCount).toBe(1);
    });

    it('should return error when session not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(null);

      const result = await service.trackPlayback('firebase-uid-123', 'nonexistent-session');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('createWave', () => {
    const sessionWithAffirmation = {
      ...mockSession,
      status: 'AFFIRMATION_GENERATED',
      selectedAffirmationText: 'I am healthy',
      waves: [],
    };

    it('should successfully create a wave', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst
        .mockResolvedValueOnce(sessionWithAffirmation)
        .mockResolvedValueOnce({ ...sessionWithAffirmation, waves: [mockWave] });
      mockPrisma.wave.create.mockResolvedValue(mockWave);

      const result = await service.createWave('firebase-uid-123', { sessionId: 'session-123', durationDays: 20 });

      expect(result.isError).toBe(false);
      expect(mockPrisma.wave.create).toHaveBeenCalled();
    });

    it('should return error when session already has active wave', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...sessionWithAffirmation,
        waves: [mockWave],
      });

      const result = await service.createWave('firebase-uid-123', { sessionId: 'session-123', durationDays: 20 });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when session has no affirmation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockSession,
        waves: [],
        selectedAffirmationText: null,
      });

      const result = await service.createWave('firebase-uid-123', { sessionId: 'session-123', durationDays: 20 });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateWave', () => {
    it('should successfully update wave duration', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wave.findFirst.mockResolvedValue(mockWave);
      mockPrisma.wave.update.mockResolvedValue({
        ...mockWave,
        durationDays: 30,
      });

      const result = await service.updateWave('firebase-uid-123', 'wave-123', { durationDays: 30 });

      expect(result.isError).toBe(false);
      expect(mockPrisma.wave.update).toHaveBeenCalled();
    });

    it('should return error when wave not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wave.findFirst.mockResolvedValue(null);

      const result = await service.updateWave('firebase-uid-123', 'nonexistent-wave', { durationDays: 30 });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when wave belongs to different user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wave.findFirst.mockResolvedValue({
        ...mockWave,
        session: { id: 'session-123', userId: 'different-user' },
      });

      const result = await service.updateWave('firebase-uid-123', 'wave-123', { durationDays: 30 });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteWave', () => {
    it('should successfully delete a wave', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wave.findFirst.mockResolvedValue(mockWave);
      mockPrisma.wave.delete.mockResolvedValue(mockWave);

      const result = await service.deleteWave('firebase-uid-123', 'wave-123');

      expect(result.isError).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should return error when wave not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.wave.findFirst.mockResolvedValue(null);

      const result = await service.deleteWave('firebase-uid-123', 'nonexistent-wave');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('regenerateAffirmationVoice', () => {
    const sessionWithAffirmation = {
      ...mockSession,
      status: 'AFFIRMATION_GENERATED',
      selectedAffirmationText: 'I am healthy and vibrant',
      affirmations: [] as any[],
    };

    it('should successfully regenerate voice', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(sessionWithAffirmation);
      mockTextToSpeechService.generateAffirmationAudio.mockResolvedValue('https://new-audio.com/audio.mp3');
      mockPrisma.reflectionSession.update.mockResolvedValue({
        ...sessionWithAffirmation,
        selectedAffirmationAudioUrl: 'https://new-audio.com/audio.mp3',
      });

      const result = await service.regenerateAffirmationVoice('firebase-uid-123', 'session-123', { voicePreference: TtsVoicePreference.FEMALE_EMPATHETIC });

      expect(result.isError).toBe(false);
      expect(mockTextToSpeechService.generateAffirmationAudio).toHaveBeenCalledWith(
        'I am healthy and vibrant',
        'user-123',
        TtsVoicePreference.FEMALE_EMPATHETIC,
      );
    });

    it('should use user preference when no voice specified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(sessionWithAffirmation);
      mockTextToSpeechService.generateAffirmationAudio.mockResolvedValue('https://audio.com/audio.mp3');
      mockPrisma.reflectionSession.update.mockResolvedValue(sessionWithAffirmation);

      await service.regenerateAffirmationVoice('firebase-uid-123', 'session-123');

      expect(mockTextToSpeechService.generateAffirmationAudio).toHaveBeenCalledWith(
        'I am healthy and vibrant',
        'user-123',
        TtsVoicePreference.MALE_CONFIDENT,
      );
    });

    it('should return error when no affirmation exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockSession,
        status: 'AFFIRMATION_GENERATED',
        selectedAffirmationText: '',
        affirmations: [],
      });

      const result = await service.regenerateAffirmationVoice('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when session not in correct status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockSession,
        selectedAffirmationText: 'I am healthy',
        affirmations: [],
      });

      const result = await service.regenerateAffirmationVoice('firebase-uid-123', 'session-123');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });
});
