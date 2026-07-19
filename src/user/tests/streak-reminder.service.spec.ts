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

  describe('sendDefaultMorningReminders', () => {
    it('notifies each eligible default user', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', streak: 3 },
        { id: 'u2', streak: 7 },
      ]);

      await service.sendDefaultMorningReminders();

      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(2);
      const firstCall = mockNotificationService.notifyUser.mock.calls[0][0];
      expect(firstCall.type).toBe(NotificationTypeEnum.STREAK_REMINDER);
      expect(firstCall.metadata.reminderKind).toBe('morning');
    });

    it('does nothing when there are no eligible users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.sendDefaultEveningReminders();

      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
    });
  });

  describe('sendCustomTimeReminders', () => {
    it('notifies users whose local time matches the current hour', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          streak: 4,
          streakReminderTimes: ['08:00'],
          timezone: 'UTC',
        },
      ]);

      await service.sendCustomTimeReminders();

      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
      const call = mockNotificationService.notifyUser.mock.calls[0][0];
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
        },
      ]);

      await service.sendCustomTimeReminders();

      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
    });

    it('returns early when no custom-time users exist', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.sendCustomTimeReminders();

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
        },
      ]);
      mockNotificationService.notifyUser.mockRejectedValue(
        new Error('push failed'),
      );

      await expect(service.sendCustomTimeReminders()).resolves.toBeUndefined();
    });
  });
});
