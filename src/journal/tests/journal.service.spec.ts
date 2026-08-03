import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { JournalService } from '../journal.service';
import { DatabaseProvider } from '../../database/database.provider';
import { StorageService, FileType } from '../../common/storage/storage.service';

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

describe('JournalService', () => {
  let service: JournalService;
  let mockPrisma: any;
  let mockStorageService: any;

  const mockUser = {
    id: 'user-123',
    firebaseId: 'firebase-uid-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockJournal = {
    id: 'journal-123',
    userId: 'user-123',
    title: 'My First Journal',
    text: 'Today was a great day...',
    date: new Date('2024-01-15'),
    imageUrl: 'https://storage.com/image.jpg',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      journal: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };

    mockStorageService = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<JournalService>(JournalService);
  });

  describe('createJournal', () => {
    const createDto = {
      title: 'My Journal Entry',
      text: 'Today I learned something new...',
      date: '2024-01-15',
    };

    it('should successfully create a journal entry', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.create.mockResolvedValue(mockJournal);

      const result = await service.createJournal('firebase-uid-123', createDto);

      expect(result.isError).toBe(false);
      expect(result.data?.id).toBe('journal-123');
      expect(mockPrisma.journal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          title: createDto.title,
          text: createDto.text,
        }),
      });
    });

    it('should successfully create a journal entry with image', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockStorageService.uploadFile.mockResolvedValue({
        url: 'https://storage.com/new-image.jpg',
      });
      mockPrisma.journal.create.mockResolvedValue({
        ...mockJournal,
        imageUrl: 'https://storage.com/new-image.jpg',
      });

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.createJournal(
        'firebase-uid-123',
        createDto,
        mockImageFile,
      );

      expect(result.isError).toBe(false);
      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        mockImageFile,
        FileType.IMAGE,
        'user-123',
        'journal/images',
      );
    });

    it('should create journal with current date if date not provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.create.mockResolvedValue(mockJournal);

      const dtoWithoutDate = { title: 'Test', text: 'Test text' };
      await service.createJournal('firebase-uid-123', dtoWithoutDate);

      expect(mockPrisma.journal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          date: expect.any(Date),
        }),
      });
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createJournal(
        'nonexistent-firebase-id',
        createDto,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when image upload fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockStorageService.uploadFile.mockRejectedValue(
        new Error('Upload failed'),
      );

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.createJournal(
        'firebase-uid-123',
        createDto,
        mockImageFile,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('getAllJournals', () => {
    it('should return paginated journals', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.count.mockResolvedValue(25);
      mockPrisma.journal.findMany.mockResolvedValue([mockJournal]);

      const result = await service.getAllJournals('firebase-uid-123', 1, 10);

      expect(result.isError).toBe(false);
      expect(result.data?.journals).toBeDefined();
      expect(result.data?.pagination).toBeDefined();
      expect(result.data?.pagination.totalCount).toBe(25);
      expect(result.data?.pagination.totalPages).toBe(3);
    });

    it('should filter by search term when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.count.mockResolvedValue(5);
      mockPrisma.journal.findMany.mockResolvedValue([mockJournal]);

      const result = await service.getAllJournals(
        'firebase-uid-123',
        1,
        10,
        'First',
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.journal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: {
              contains: 'First',
              mode: 'insensitive',
            },
          }),
        }),
      );
    });

    it('should ignore empty search term', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.count.mockResolvedValue(10);
      mockPrisma.journal.findMany.mockResolvedValue([mockJournal]);

      await service.getAllJournals('firebase-uid-123', 1, 10, '   ');

      expect(mockPrisma.journal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
        }),
      );
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getAllJournals('nonexistent-firebase-id');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should handle pagination bounds correctly', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.count.mockResolvedValue(100);
      mockPrisma.journal.findMany.mockResolvedValue([]);

      const result = await service.getAllJournals('firebase-uid-123', -1, 200);

      expect(result.isError).toBe(false);
      expect(result.data?.pagination.page).toBe(1);
      expect(result.data?.pagination.limit).toBe(100);
    });

    it('should correctly calculate hasNextPage and hasPreviousPage', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.count.mockResolvedValue(30);
      mockPrisma.journal.findMany.mockResolvedValue([mockJournal]);

      const result = await service.getAllJournals('firebase-uid-123', 2, 10);

      expect(result.isError).toBe(false);
      expect(result.data?.pagination.hasNextPage).toBe(true);
      expect(result.data?.pagination.hasPreviousPage).toBe(true);
    });
  });

  describe('getJournalById', () => {
    it('should return journal by id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);

      const result = await service.getJournalById(
        'firebase-uid-123',
        'journal-123',
      );

      expect(result.isError).toBe(false);
      expect(result.data?.id).toBe('journal-123');
      expect(result.data?.title).toBe('My First Journal');
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getJournalById(
        'nonexistent-firebase-id',
        'journal-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when journal not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(null);

      const result = await service.getJournalById(
        'firebase-uid-123',
        'nonexistent-journal',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should only return journal belonging to the user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);

      await service.getJournalById('firebase-uid-123', 'journal-123');

      expect(mockPrisma.journal.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'journal-123',
          userId: 'user-123',
        },
      });
    });
  });

  describe('updateJournal', () => {
    const updateDto = {
      title: 'Updated Title',
      text: 'Updated text content',
      date: '2024-02-20',
    };

    it('should successfully update journal entry', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);
      mockPrisma.journal.update.mockResolvedValue({
        ...mockJournal,
        title: 'Updated Title',
        text: 'Updated text content',
      });

      const result = await service.updateJournal(
        'firebase-uid-123',
        'journal-123',
        updateDto,
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.journal.update).toHaveBeenCalledWith({
        where: { id: 'journal-123' },
        data: expect.objectContaining({
          title: 'Updated Title',
          text: 'Updated text content',
        }),
      });
    });

    it('should successfully update journal with new image', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);
      mockStorageService.uploadFile.mockResolvedValue({
        url: 'https://storage.com/new-image.jpg',
      });
      mockPrisma.journal.update.mockResolvedValue({
        ...mockJournal,
        imageUrl: 'https://storage.com/new-image.jpg',
      });

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.updateJournal(
        'firebase-uid-123',
        'journal-123',
        {},
        mockImageFile,
      );

      expect(result.isError).toBe(false);
      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        mockImageFile,
        FileType.IMAGE,
        'user-123',
        'journal/images',
      );
    });

    it('should ignore empty string fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);
      mockPrisma.journal.update.mockResolvedValue(mockJournal);

      const emptyDto = { title: '', text: '   ', date: '' };
      await service.updateJournal('firebase-uid-123', 'journal-123', emptyDto);

      expect(mockPrisma.journal.update).toHaveBeenCalledWith({
        where: { id: 'journal-123' },
        data: {},
      });
    });

    it('should ignore undefined and null fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);
      mockPrisma.journal.update.mockResolvedValue(mockJournal);

      const partialDto = { title: 'New Title', text: undefined, date: null };
      await service.updateJournal(
        'firebase-uid-123',
        'journal-123',
        partialDto as any,
      );

      expect(mockPrisma.journal.update).toHaveBeenCalledWith({
        where: { id: 'journal-123' },
        data: { title: 'New Title' },
      });
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.updateJournal(
        'nonexistent-firebase-id',
        'journal-123',
        updateDto,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when journal not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(null);

      const result = await service.updateJournal(
        'firebase-uid-123',
        'nonexistent-journal',
        updateDto,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when image upload fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);
      mockStorageService.uploadFile.mockRejectedValue(
        new Error('Upload failed'),
      );

      const mockImageFile = {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;
      const result = await service.updateJournal(
        'firebase-uid-123',
        'journal-123',
        {},
        mockImageFile,
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteJournal', () => {
    it('should successfully delete a journal entry', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);
      mockPrisma.journal.delete.mockResolvedValue(mockJournal);

      const result = await service.deleteJournal(
        'firebase-uid-123',
        'journal-123',
      );

      expect(result.isError).toBe(false);
      expect(result.data?.message).toBe('Journal entry deleted successfully');
      expect(mockPrisma.journal.delete).toHaveBeenCalledWith({
        where: { id: 'journal-123' },
      });
    });

    it('should return error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.deleteJournal(
        'nonexistent-firebase-id',
        'journal-123',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should return error when journal not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(null);

      const result = await service.deleteJournal(
        'firebase-uid-123',
        'nonexistent-journal',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('should only delete journal belonging to the user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.journal.findFirst.mockResolvedValue(mockJournal);
      mockPrisma.journal.delete.mockResolvedValue(mockJournal);

      await service.deleteJournal('firebase-uid-123', 'journal-123');

      expect(mockPrisma.journal.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'journal-123',
          userId: 'user-123',
        },
      });
    });
  });
});
