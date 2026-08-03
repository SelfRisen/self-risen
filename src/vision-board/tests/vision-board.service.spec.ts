import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VisionBoardService } from '../vision-board.service';
import { DatabaseProvider } from '../../database/database.provider';
import { StorageService, FileType } from '../../common/storage/storage.service';
import { StaterVideosService } from '../../stater-videos/stater-videos.service';
import { ReflectionSessionStatus } from '@prisma/client';

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

describe('VisionBoardService', () => {
  let service: VisionBoardService;
  let mockPrisma: any;
  let mockStorageService: any;
  let mockStaterVideosService: any;

  const mockUser = {
    id: 'user-123',
    firebaseId: 'firebase-uid-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockCategory = {
    id: 'cat-1',
    name: 'Health & Well-being',
    order: 1,
  };

  const mockVisionBoard = {
    id: 'vision-board-123',
    userId: 'user-123',
    categoryId: 'cat-1',
    category: mockCategory,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReflectionSession = {
    id: 'session-123',
    userId: 'user-123',
    categoryId: 'cat-1',
    prompt: 'My body is...',
    status: ReflectionSessionStatus.AFFIRMATION_GENERATED,
    selectedAffirmationText: 'I am healthy and vibrant',
    category: { id: 'cat-1', name: 'Health & Well-being' },
    reflectionSound: null as {
      id: string;
      soundUrl: string;
      name: string | null;
      fileSize: number | null;
      mimeType: string | null;
    } | null,
  };

  const mockVision = {
    id: 'vision-123',
    visionBoardId: 'vision-board-123',
    reflectionSessionId: 'session-123',
    imageUrl: 'https://storage.com/image.jpg',
    order: 1,
    visionSoundId: null as string | null,
    visionSound: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    reflectionSession: mockReflectionSession,
  };

  const mockVisionBoardSound = {
    id: 'sound-123',
    soundUrl: 'https://storage.com/sound.mp3',
    name: 'meditation.mp3',
    fileSize: 1024000,
    mimeType: 'audio/mp3',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      visionBoard: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      vision: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      reflectionSession: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      visionSound: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      // The service wraps writes in $transaction; run the callback with the
      // same mocked client so tx.* calls resolve to these jest mocks.
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };

    mockStorageService = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
    };

    mockStaterVideosService = {
      getSoundByName: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisionBoardService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
        { provide: StaterVideosService, useValue: mockStaterVideosService },
      ],
    }).compile();

    service = module.get<VisionBoardService>(VisionBoardService);
  });

  describe('addVision', () => {
    it('should successfully add a vision with reflection session', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(mockVisionBoard);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(
        mockReflectionSession,
      );
      mockPrisma.vision.findUnique.mockResolvedValue(null);
      mockPrisma.vision.findFirst.mockResolvedValue(null);
      mockPrisma.vision.create.mockResolvedValue(mockVision);

      const result = await service.addVision(
        'firebase-uid-123',
        'vision-board-123',
        'session-123',
      );

      expect(result.isError).toBe(false);
      expect(result.data?.id).toBe('vision-123');
      expect(mockPrisma.vision.create).toHaveBeenCalled();
      const createData = mockPrisma.vision.create.mock.calls[0][0].data;
      expect(createData.visionSound).toBeUndefined();
    });

    it('should create vision sound from reflection sound when session has reflectionSound', async () => {
      const sessionWithSound = {
        ...mockReflectionSession,
        reflectionSound: {
          id: 'ref-sound-1',
          soundUrl: 'https://storage.com/ref-sound.mp3',
          name: 'ambient.mp3',
          fileSize: 1024,
          mimeType: 'audio/mpeg',
        },
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(mockVisionBoard);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(
        sessionWithSound,
      );
      mockPrisma.vision.findUnique.mockResolvedValue(null);
      mockPrisma.vision.findFirst.mockResolvedValue(null);
      mockPrisma.visionSound.findFirst.mockResolvedValue(null);
      mockPrisma.visionSound.create.mockResolvedValue({
        ...mockVisionBoardSound,
        id: 'new-vision-sound-123',
      });
      mockPrisma.vision.create.mockResolvedValue({
        ...mockVision,
        visionSoundId: 'new-vision-sound-123',
        visionSound: mockVisionBoardSound,
      });

      const result = await service.addVision(
        'firebase-uid-123',
        'vision-board-123',
        'session-123',
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.visionSound.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          soundUrl: 'https://storage.com/ref-sound.mp3',
          name: 'ambient.mp3',
        }),
      });
      const createData = mockPrisma.vision.create.mock.calls[0][0].data;
      expect(createData.visionSound).toEqual({
        connect: { id: 'new-vision-sound-123' },
      });
    });

    it('should successfully add a vision with image file', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(mockVisionBoard);
      mockPrisma.vision.findFirst.mockResolvedValue(null);
      mockStorageService.uploadFile.mockResolvedValue({
        url: 'https://storage.com/new-image.jpg',
      });
      mockPrisma.vision.create.mockResolvedValue({
        ...mockVision,
        reflectionSessionId: null,
        reflectionSession: null,
      });

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.addVision(
        'firebase-uid-123',
        'vision-board-123',
        undefined,
        mockImageFile,
      );

      expect(result.isError).toBe(false);
      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        mockImageFile,
        FileType.IMAGE,
        'user-123',
        'vision-board/images',
      );
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.addVision(
        'nonexistent-firebase-id',
        'vision-board-123',
        'session-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when visionBoardId is not provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.addVision(
        'firebase-uid-123',
        '',
        'session-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when neither reflectionSessionId nor imageFile is provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(mockVisionBoard);

      const result = await service.addVision(
        'firebase-uid-123',
        'vision-board-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when vision board not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(null);

      const result = await service.addVision(
        'firebase-uid-123',
        'nonexistent-board',
        'session-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when reflection session not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(mockVisionBoard);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(null);

      const result = await service.addVision(
        'firebase-uid-123',
        'vision-board-123',
        'nonexistent-session',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when reflection session is not in AFFIRMATION_GENERATED status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(mockVisionBoard);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockReflectionSession,
        status: ReflectionSessionStatus.PENDING,
      });

      const result = await service.addVision(
        'firebase-uid-123',
        'vision-board-123',
        'session-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when reflection session is already in vision board', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(mockVisionBoard);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(
        mockReflectionSession,
      );
      // Existing-vision duplicate check uses vision.findFirst.
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);

      const result = await service.addVision(
        'firebase-uid-123',
        'vision-board-123',
        'session-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when image upload fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findFirst.mockResolvedValue(mockVisionBoard);
      mockStorageService.uploadFile.mockRejectedValue(
        new Error('Upload failed'),
      );

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.addVision(
        'firebase-uid-123',
        'vision-board-123',
        undefined,
        mockImageFile,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('getAllVisions', () => {
    it('should return paginated visions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.count.mockResolvedValue(15);
      mockPrisma.vision.findMany.mockResolvedValue([mockVision]);

      const result = await service.getAllVisions('firebase-uid-123', 1, 10);

      expect(result.isError).toBe(false);
      expect(result.data?.visions).toBeDefined();
      expect(result.data?.pagination).toBeDefined();
      expect(result.data?.pagination.total).toBe(15);
    });

    it('should filter by visionBoardId when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.count.mockResolvedValue(5);
      mockPrisma.vision.findMany.mockResolvedValue([mockVision]);

      const result = await service.getAllVisions(
        'firebase-uid-123',
        1,
        10,
        'vision-board-123',
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.vision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visionBoard: expect.objectContaining({
              id: 'vision-board-123',
            }),
          }),
        }),
      );
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getAllVisions('nonexistent-firebase-id');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should handle pagination bounds correctly', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.count.mockResolvedValue(100);
      mockPrisma.vision.findMany.mockResolvedValue([]);

      const result = await service.getAllVisions('firebase-uid-123', -1, 200);

      expect(result.isError).toBe(false);
      expect(result.data?.pagination.page).toBe(1);
      expect(result.data?.pagination.limit).toBe(100);
    });
  });

  describe('getVisionById', () => {
    it('should return vision by id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);

      const result = await service.getVisionById(
        'firebase-uid-123',
        'vision-123',
      );

      expect(result.isError).toBe(false);
      expect(result.data?.id).toBe('vision-123');
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getVisionById(
        'nonexistent-firebase-id',
        'vision-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when vision not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(null);

      const result = await service.getVisionById(
        'firebase-uid-123',
        'nonexistent-vision',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateVision', () => {
    it('should successfully update vision with new image', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);
      mockStorageService.uploadFile.mockResolvedValue({
        url: 'https://storage.com/new-image.jpg',
      });
      mockStorageService.deleteFile.mockResolvedValue(undefined);
      mockPrisma.vision.update.mockResolvedValue({
        ...mockVision,
        imageUrl: 'https://storage.com/new-image.jpg',
      });

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.updateVision(
        'firebase-uid-123',
        'vision-123',
        undefined,
        mockImageFile,
      );

      expect(result.isError).toBe(false);
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
    });

    it('should successfully update vision with new reflection session', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue({
        ...mockReflectionSession,
        id: 'new-session-123',
      });
      mockPrisma.vision.findUnique.mockResolvedValue(null);
      mockPrisma.vision.update.mockResolvedValue({
        ...mockVision,
        reflectionSessionId: 'new-session-123',
      });

      const result = await service.updateVision(
        'firebase-uid-123',
        'vision-123',
        'new-session-123',
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.vision.update).toHaveBeenCalled();
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.updateVision(
        'nonexistent-firebase-id',
        'vision-123',
        undefined,
        mockImageFile,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when no update parameters are provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.updateVision(
        'firebase-uid-123',
        'vision-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should successfully update vision background sound', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);
      mockPrisma.visionSound.findUnique.mockResolvedValue(mockVisionBoardSound);
      mockPrisma.vision.update.mockResolvedValue({
        ...mockVision,
        visionSoundId: 'sound-123',
        visionSound: mockVisionBoardSound,
      });

      const result = await service.updateVision(
        'firebase-uid-123',
        'vision-123',
        undefined,
        undefined,
        'sound-123',
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.visionSound.findUnique).toHaveBeenCalledWith({
        where: { id: 'sound-123' },
      });
      expect(mockPrisma.vision.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vision-123' },
          data: expect.objectContaining({
            visionSound: { connect: { id: 'sound-123' } },
          }),
        }),
      );
    });

    it('should return error when vision not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(null);

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.updateVision(
        'firebase-uid-123',
        'nonexistent-vision',
        undefined,
        mockImageFile,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when reflection session not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(null);

      const result = await service.updateVision(
        'firebase-uid-123',
        'vision-123',
        'nonexistent-session',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when reflection session is already linked to another vision', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      // First findFirst loads the vision being updated; second is the
      // duplicate-check which returns a different vision already linked.
      mockPrisma.vision.findFirst
        .mockResolvedValueOnce(mockVision)
        .mockResolvedValueOnce({ id: 'another-vision-123' });
      mockPrisma.reflectionSession.findFirst.mockResolvedValue(
        mockReflectionSession,
      );

      const result = await service.updateVision(
        'firebase-uid-123',
        'vision-123',
        'session-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when image upload fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);
      mockStorageService.uploadFile.mockRejectedValue(
        new Error('Upload failed'),
      );

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.updateVision(
        'firebase-uid-123',
        'vision-123',
        undefined,
        mockImageFile,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('removeVision', () => {
    it('should successfully remove a vision', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);
      mockStorageService.deleteFile.mockResolvedValue(undefined);
      mockPrisma.vision.delete.mockResolvedValue(mockVision);

      const result = await service.removeVision(
        'firebase-uid-123',
        'vision-123',
      );

      expect(result.isError).toBe(false);
      expect(result.data).toBeNull();
      expect(mockPrisma.vision.delete).toHaveBeenCalledWith({
        where: { id: 'vision-123' },
      });
    });

    it('should successfully remove a vision without image', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue({
        ...mockVision,
        imageUrl: null,
      });
      mockPrisma.vision.delete.mockResolvedValue(mockVision);

      const result = await service.removeVision(
        'firebase-uid-123',
        'vision-123',
      );

      expect(result.isError).toBe(false);
      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.removeVision(
        'nonexistent-firebase-id',
        'vision-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when vision not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(null);

      const result = await service.removeVision(
        'firebase-uid-123',
        'nonexistent-vision',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should still delete vision even if image deletion fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVision);
      mockStorageService.deleteFile.mockRejectedValue(
        new Error('Delete failed'),
      );
      mockPrisma.vision.delete.mockResolvedValue(mockVision);

      const result = await service.removeVision(
        'firebase-uid-123',
        'vision-123',
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.vision.delete).toHaveBeenCalled();
    });
  });

  describe('uploadSound', () => {
    it('should successfully upload sound files', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionSound.findFirst.mockResolvedValue(null);
      mockStorageService.uploadFile.mockResolvedValue({
        url: 'https://storage.com/sound.mp3',
      });
      mockPrisma.visionSound.create.mockResolvedValue(mockVisionBoardSound);

      const mockSoundFile = {
        buffer: Buffer.from('audio'),
        mimetype: 'audio/mp3',
        originalname: 'meditation.mp3',
        size: 1024000,
      } as Express.Multer.File;
      const result = await service.uploadSound('firebase-uid-123', [
        mockSoundFile,
      ]);

      expect(result.isError).toBe(false);
      expect(result.data?.uploaded).toBe(1);
      expect(result.data?.files).toHaveLength(1);
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const mockSoundFile = {
        buffer: Buffer.from('audio'),
        mimetype: 'audio/mp3',
      } as Express.Multer.File;
      const result = await service.uploadSound('nonexistent-firebase-id', [
        mockSoundFile,
      ]);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when no sound files provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.uploadSound('firebase-uid-123', []);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('should return error when all uploads fail', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionSound.findFirst.mockResolvedValue(null);
      mockStorageService.uploadFile.mockRejectedValue(
        new Error('Upload failed'),
      );

      const mockSoundFile = {
        buffer: Buffer.from('audio'),
        mimetype: 'audio/mp3',
        originalname: 'test.mp3',
      } as Express.Multer.File;
      const result = await service.uploadSound('firebase-uid-123', [
        mockSoundFile,
      ]);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('getSounds', () => {
    it('should return all vision sounds', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionSound.findMany.mockResolvedValue([mockVisionBoardSound]);

      const result = await service.getSounds('firebase-uid-123');

      expect(result.isError).toBe(false);
      expect(result.data?.count).toBe(1);
      expect(result.data?.files).toHaveLength(1);
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getSounds('nonexistent-firebase-id');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('getAllVisionBoards', () => {
    it('should return all vision boards for user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionBoard.findMany.mockResolvedValue([
        { ...mockVisionBoard, _count: { visions: 5 } },
      ]);

      const result = await service.getAllVisionBoards('firebase-uid-123');

      expect(result.isError).toBe(false);
      expect(result.data?.count).toBe(1);
      expect(result.data?.boards).toHaveLength(1);
      expect(result.data?.boards[0].visionCount).toBe(5);
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getAllVisionBoards(
        'nonexistent-firebase-id',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('reorderVision', () => {
    const mockVisions = [
      { id: 'vision-1', visionBoardId: 'board-1', order: 1 },
      { id: 'vision-2', visionBoardId: 'board-1', order: 2 },
      { id: 'vision-3', visionBoardId: 'board-1', order: 3 },
    ];

    it('should successfully reorder vision moving down', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVisions[0]);
      mockPrisma.vision.findMany
        .mockResolvedValueOnce(mockVisions)
        .mockResolvedValueOnce([
          { id: 'vision-2', order: 1 },
          { id: 'vision-3', order: 2 },
          { id: 'vision-1', order: 3 },
        ]);
      mockPrisma.vision.update.mockResolvedValue({});

      const result = await service.reorderVision(
        'firebase-uid-123',
        'vision-1',
        3,
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.vision.update).toHaveBeenCalled();
    });

    it('should successfully reorder vision moving up', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVisions[2]);
      mockPrisma.vision.findMany
        .mockResolvedValueOnce(mockVisions)
        .mockResolvedValueOnce([
          { id: 'vision-3', order: 1 },
          { id: 'vision-1', order: 2 },
          { id: 'vision-2', order: 3 },
        ]);
      mockPrisma.vision.update.mockResolvedValue({});

      const result = await service.reorderVision(
        'firebase-uid-123',
        'vision-3',
        1,
      );

      expect(result.isError).toBe(false);
    });

    it('should return early when new order equals current order', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(mockVisions[0]);

      const result = await service.reorderVision(
        'firebase-uid-123',
        'vision-1',
        1,
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.vision.findMany).not.toHaveBeenCalled();
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.reorderVision(
        'nonexistent-firebase-id',
        'vision-1',
        2,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when vision not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.vision.findFirst.mockResolvedValue(null);

      const result = await service.reorderVision(
        'firebase-uid-123',
        'nonexistent-vision',
        2,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('reorderSound', () => {
    const mockSounds = [
      { id: 'sound-1', order: 1 },
      { id: 'sound-2', order: 2 },
      { id: 'sound-3', order: 3 },
    ];

    it('should successfully reorder sound moving down', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionSound.findUnique.mockResolvedValue(mockSounds[0]);
      mockPrisma.visionSound.findMany
        .mockResolvedValueOnce(mockSounds)
        .mockResolvedValueOnce([
          { id: 'sound-2', order: 1, name: 'sound2.mp3' },
          { id: 'sound-3', order: 2, name: 'sound3.mp3' },
          { id: 'sound-1', order: 3, name: 'sound1.mp3' },
        ]);
      mockPrisma.visionSound.update.mockResolvedValue({});

      const result = await service.reorderSound(
        'firebase-uid-123',
        'sound-1',
        3,
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.visionSound.update).toHaveBeenCalled();
    });

    it('should successfully reorder sound moving up', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionSound.findUnique.mockResolvedValue(mockSounds[2]);
      mockPrisma.visionSound.findMany
        .mockResolvedValueOnce(mockSounds)
        .mockResolvedValueOnce([
          { id: 'sound-3', order: 1, name: 'sound3.mp3' },
          { id: 'sound-1', order: 2, name: 'sound1.mp3' },
          { id: 'sound-2', order: 3, name: 'sound2.mp3' },
        ]);
      mockPrisma.visionSound.update.mockResolvedValue({});

      const result = await service.reorderSound(
        'firebase-uid-123',
        'sound-3',
        1,
      );

      expect(result.isError).toBe(false);
    });

    it('should return early when new order equals current order', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionSound.findUnique.mockResolvedValue(mockSounds[0]);

      const result = await service.reorderSound(
        'firebase-uid-123',
        'sound-1',
        1,
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.visionSound.findMany).not.toHaveBeenCalled();
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.reorderSound(
        'nonexistent-firebase-id',
        'sound-1',
        2,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when sound not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.visionSound.findUnique.mockResolvedValue(null);

      const result = await service.reorderSound(
        'firebase-uid-123',
        'nonexistent-sound',
        2,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });
});
