import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserService } from '../user.service';
import { DatabaseProvider } from '../../database/database.provider';
import { StorageService } from '../../common/storage/storage.service';
import { TextToSpeechService } from '../../reflection/services/text-to-speech.service';
import { TtsVoicePreference } from '@prisma/client';

const sagePersona = {
  name: 'Sage',
  displayName: 'Sage (Empathetic Mentor)',
  description: 'Nurturing, warm voice',
  personality: ['nurturing', 'compassionate'],
};

const P2025 = Object.assign(new Error('Record not found'), { code: 'P2025' });

describe('UserService', () => {
  let service: UserService;
  let mockPrisma: any;
  let mockStorageService: any;
  let mockTts: any;

  const mockUser = {
    id: 'user-123',
    firebaseId: 'fb-123',
    email: 'test@example.com',
    name: 'Test User',
    username: 'tester',
    avatar: null,
    ttsVoicePreference: TtsVoicePreference.SAGE,
    tokensUsedThisMonth: 6000,
    tokenLimitPerMonth: 300000,
    tokenResetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    streak: 5,
    sessions: 12,
    streakReminderEnabled: true,
    streakReminderTimes: ['08:00'],
    timezone: 'America/New_York',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockStorageService = {
      uploadFile: jest.fn(),
    };

    mockTts = {
      getPersonaMetadata: jest.fn((pref?: string | null) =>
        pref === TtsVoicePreference.SAGE || pref === 'Sage'
          ? sagePersona
          : null,
      ),
      convertNameToEnum: jest.fn((name: string) =>
        name === 'Sage' ? TtsVoicePreference.SAGE : null,
      ),
      getAllPersonas: jest.fn(() => [
        { preference: TtsVoicePreference.SAGE, config: sagePersona },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
        { provide: TextToSpeechService, useValue: mockTts },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns enriched users with pagination metadata', async () => {
      mockPrisma.user.count.mockResolvedValue(25);
      mockPrisma.user.findMany.mockResolvedValue([{ ...mockUser }]);

      const result = await service.findAll(1, 10);

      expect(result.isError).toBe(false);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10, orderBy: { id: 'asc' } }),
      );
      expect(result.data?.users[0].ttsVoicePersona).toEqual({
        name: sagePersona.name,
        displayName: sagePersona.displayName,
        description: sagePersona.description,
        personality: sagePersona.personality,
      });
      expect(result.data?.pagination).toEqual({
        page: 1,
        limit: 10,
        totalCount: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('clamps invalid page/limit values', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.findAll(0, 1000);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });
  });

  describe('getUserProfile', () => {
    it('returns NotFound when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getUserProfile('missing');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('returns profile with token usage summary', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        _count: { reflectionSessions: 3 },
      });

      const result = await service.getUserProfile('fb-123');

      expect(result.isError).toBe(false);
      expect(result.data?.tokenUsage).toEqual(
        expect.objectContaining({
          tokensUsedThisMonth: 6000,
          tokenLimitPerMonth: 300000,
          tokensRemaining: 294000,
          usagePercentage: 2,
        }),
      );
      expect(result.data?.tokenUsage.daysUntilReset).toBeGreaterThanOrEqual(9);
    });

    it('reports 0% usage instead of NaN when the token limit is 0', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tokensUsedThisMonth: 100,
        tokenLimitPerMonth: 0,
        _count: { reflectionSessions: 0 },
      });

      const result = await service.getUserProfile('fb-123');

      expect(result.data?.tokenUsage.usagePercentage).toBe(0);
    });
  });

  describe('updateUser', () => {
    it('returns NotFound when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.updateUser('missing', { name: 'New' });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('rejects an empty payload', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser });

      const result = await service.updateUser('fb-123', {});

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('updates name/username without location', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser });
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        name: 'New Name',
      });

      const result = await service.updateUser('fb-123', { name: 'New Name' });

      expect(result.isError).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { firebaseId: 'fb-123' },
          data: { name: 'New Name' },
        }),
      );
    });

    it('rejects an invalid persona name', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser });

      const result = await service.updateUser('fb-123', {
        ttsVoicePreference: 'Nope',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
    });

    it('derives timezone for a valid country code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser });
      mockPrisma.user.update.mockResolvedValue({ ...mockUser });

      const result = await service.updateUser('fb-123', { countryCode: 'US' });

      expect(result.isError).toBe(false);
      const data = mockPrisma.user.update.mock.calls[0][0].data;
      expect(data.countryCode).toBe('US');
      expect(typeof data.timezone).toBe('string');
    });

    it('rejects a country code that resolves to no timezone', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser });

      const result = await service.updateUser('fb-123', { countryCode: 'ZZ' });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('maps a P2025 update failure to NotFound', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser });
      mockPrisma.user.update.mockRejectedValue(P2025);

      const result = await service.updateUser('fb-123', { name: 'x' });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('changeName', () => {
    it('updates the name', async () => {
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Renamed',
      });

      const result = await service.changeName('fb-123', { name: 'Renamed' });

      expect(result.isError).toBe(false);
      expect(result.data?.name).toBe('Renamed');
    });

    it('maps P2025 to NotFound', async () => {
      mockPrisma.user.update.mockRejectedValue(P2025);

      const result = await service.changeName('fb-123', { name: 'Renamed' });

      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('changeUsername', () => {
    it('updates the username', async () => {
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        username: 'newname',
      });

      const result = await service.changeUsername('fb-123', {
        username: 'newname',
      });

      expect(result.isError).toBe(false);
      expect(result.data?.username).toBe('newname');
    });

    it('maps P2025 to NotFound', async () => {
      mockPrisma.user.update.mockRejectedValue(P2025);

      const result = await service.changeUsername('fb-123', { username: 'x' });

      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteUser', () => {
    it('deletes and returns null data', async () => {
      mockPrisma.user.delete.mockResolvedValue({ ...mockUser });

      const result = await service.deleteUser('fb-123');

      expect(result.isError).toBe(false);
      expect(result.data).toBeNull();
    });

    it('maps P2025 to NotFound', async () => {
      mockPrisma.user.delete.mockRejectedValue(P2025);

      const result = await service.deleteUser('fb-123');

      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('uploadAvatar', () => {
    const file = { originalname: 'a.png' } as Express.Multer.File;

    it('returns NotFound when the user is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.uploadAvatar('missing', file);

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
    });

    it('uploads the file and stores the returned URL', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser });
      mockStorageService.uploadFile.mockResolvedValue({
        url: 'https://cdn/x.png',
      });
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        avatar: 'https://cdn/x.png',
      });

      const result = await service.uploadAvatar('fb-123', file);

      expect(result.isError).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { avatar: 'https://cdn/x.png' } }),
      );
      expect(result.data?.avatar).toBe('https://cdn/x.png');
    });
  });

  describe('getStats', () => {
    it('returns NotFound when missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getStats('missing');

      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('returns streak and sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ streak: 5, sessions: 12 });

      const result = await service.getStats('fb-123');

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({ streak: 5, sessions: 12 });
    });
  });

  describe('changeTtsVoicePreference', () => {
    it('rejects an invalid persona name', async () => {
      const result = await service.changeTtsVoicePreference('fb-123', {
        ttsVoicePreference: 'Nope',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('updates the preference for a valid persona', async () => {
      mockPrisma.user.update.mockResolvedValue({ ...mockUser });

      const result = await service.changeTtsVoicePreference('fb-123', {
        ttsVoicePreference: 'Sage',
      });

      expect(result.isError).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ttsVoicePreference: TtsVoicePreference.SAGE },
        }),
      );
    });

    it('maps P2025 to NotFound', async () => {
      mockPrisma.user.update.mockRejectedValue(P2025);

      const result = await service.changeTtsVoicePreference('fb-123', {
        ttsVoicePreference: 'Sage',
      });

      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('getAvailablePersonas', () => {
    it('maps persona configs to the response shape', async () => {
      const result = service.getAvailablePersonas();

      expect(result.isError).toBe(false);
      expect(result.data?.personas).toEqual([
        {
          name: 'Sage',
          displayName: sagePersona.displayName,
          description: sagePersona.description,
          personality: sagePersona.personality,
          preference: 'Sage',
        },
      ]);
    });
  });

  describe('streak reminder preferences', () => {
    it('returns defaults when fields are empty/null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        streakReminderEnabled: true,
        streakReminderTimes: null,
        timezone: null,
      });

      const result = await service.getStreakReminderPreferences('fb-123');

      expect(result.data).toEqual({
        enabled: true,
        times: [],
        timezone: 'UTC',
      });
    });

    it('returns NotFound when missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getStreakReminderPreferences('missing');

      expect(result.error).toBeInstanceOf(NotFoundException);
    });

    it('updates preferences', async () => {
      mockPrisma.user.update.mockResolvedValue({
        streakReminderEnabled: false,
        streakReminderTimes: ['09:00'],
        timezone: 'UTC',
      });

      const result = await service.updateStreakReminderPreferences('fb-123', {
        enabled: false,
        times: ['09:00'],
      });

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({
        enabled: false,
        times: ['09:00'],
        timezone: 'UTC',
      });
    });

    it('maps P2025 to NotFound', async () => {
      mockPrisma.user.update.mockRejectedValue(P2025);

      const result = await service.updateStreakReminderPreferences('fb-123', {
        enabled: true,
      });

      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });
});
