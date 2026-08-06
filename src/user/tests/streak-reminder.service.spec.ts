import { Test, TestingModule } from '@nestjs/testing';
import { StreakReminderService } from '../streak-reminder.service';
import { DatabaseProvider } from '../../database/database.provider';
import { INotificationService } from '../../notifications/interfaces/notification.interface';
import { NotificationTypeEnum } from '../../notifications/enums/notification.enum';

describe('StreakReminderService', () => {
  let service: StreakReminderService;
  let mockPrisma: any;
  let mockNotificationService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      user: {
        findMany: jest.fn(),
      },
      wave: {
        // No wave running unless a test says otherwise.
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockNotificationService = {
      notifyUser: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreakReminderService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: INotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<StreakReminderService>(StreakReminderService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sendStreakReminders', () => {
    it('notifies users whose local time matches the current hour', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          streak: 4,
          streakReminderTimes: ['08:00'],
          timezone: 'UTC',
          lastStreakDate: null,
        },
      ]);

      await service.sendStreakReminders();

      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
      const call = mockNotificationService.notifyUser.mock.calls[0][0];
      expect(call.type).toBe(NotificationTypeEnum.STREAK_REMINDER);
      expect(call.metadata.reminderKind).toBe('morning');
      expect(call.metadata.streak).toBe(4);
    });

    it('skips users whose reminder time does not match the current hour', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          streak: 4,
          streakReminderTimes: ['09:00'],
          timezone: 'UTC',
          lastStreakDate: null,
        },
      ]);

      await service.sendStreakReminders();

      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
    });

    it('returns early when no users are eligible', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.sendStreakReminders();

      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
    });

    it('does not throw when a notification fails', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          streak: 4,
          streakReminderTimes: ['08:00'],
          timezone: 'UTC',
          lastStreakDate: null,
        },
      ]);
      mockNotificationService.notifyUser.mockRejectedValue(
        new Error('push failed'),
      );

      await expect(service.sendStreakReminders()).resolves.toBeUndefined();
    });

    // Defaults used to be two crons pinned to fixed UTC hours, so "Good
    // morning" arrived at 04:00 for anyone in New York.
    describe('users with no times of their own', () => {
      const defaultUser = (timezone: string) => ({
        id: 'u1',
        streak: 4,
        streakReminderTimes: [],
        timezone,
        lastStreakDate: null,
      });

      it('sends at 08:00 local, not 08:00 UTC', async () => {
        // 13:00 UTC is 08:00 in New York (EST, UTC-5) in January.
        jest.useFakeTimers().setSystemTime(new Date('2024-01-15T13:00:00Z'));
        mockPrisma.user.findMany.mockResolvedValue([
          defaultUser('America/New_York'),
        ]);

        await service.sendStreakReminders();

        expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
        expect(
          mockNotificationService.notifyUser.mock.calls[0][0].metadata
            .reminderKind,
        ).toBe('morning');
      });

      it('stays quiet at 08:00 UTC for a user who is not in UTC', async () => {
        // 03:00 in New York. The old schedule sent here.
        jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
        mockPrisma.user.findMany.mockResolvedValue([
          defaultUser('America/New_York'),
        ]);

        await service.sendStreakReminders();

        expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
      });

      it('is unchanged for a user actually in UTC', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2024-01-15T18:00:00Z'));
        mockPrisma.user.findMany.mockResolvedValue([defaultUser('UTC')]);

        await service.sendStreakReminders();

        expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
      });
    });

    it('stays quiet when the user has already been active today', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          streak: 4,
          streakReminderTimes: ['08:00'],
          timezone: 'UTC',
          lastStreakDate: new Date('2024-01-15T00:00:00Z'),
        },
      ]);

      await service.sendStreakReminders();

      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
    });

    it('still reminds when the last activity was yesterday', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          streak: 4,
          streakReminderTimes: ['08:00'],
          timezone: 'UTC',
          lastStreakDate: new Date('2024-01-14T00:00:00Z'),
        },
      ]);

      await service.sendStreakReminders();

      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
    });

    // A running wave sends its own nudge and knows whether the day is done,
    // so it owns the daily ask rather than adding a second notification.
    it('leaves a user with a running wave to the wave reminder', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          streak: 4,
          streakReminderTimes: ['08:00'],
          timezone: 'UTC',
          lastStreakDate: null,
        },
      ]);
      mockPrisma.wave.findMany.mockResolvedValue([
        { session: { userId: 'u1' } },
      ]);

      await service.sendStreakReminders();

      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
    });

    it('still reminds a user whose wave belongs to someone else', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          streak: 4,
          streakReminderTimes: ['08:00'],
          timezone: 'UTC',
          lastStreakDate: null,
        },
      ]);
      mockPrisma.wave.findMany.mockResolvedValue([
        { session: { userId: 'someone-else' } },
      ]);

      await service.sendStreakReminders();

      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
    });
  });
});
