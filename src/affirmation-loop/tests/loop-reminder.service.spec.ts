import { Test, TestingModule } from '@nestjs/testing';
import { LoopReminderService } from '../loop-reminder.service';
import { DatabaseProvider } from '../../database/database.provider';
import { INotificationService } from '../../notifications/interfaces/notification.interface';
import { NotificationTypeEnum } from '../../notifications/enums/notification.enum';

describe('LoopReminderService', () => {
  let service: LoopReminderService;
  let mockPrisma: any;
  let mockNotificationService: any;

  /** An active reminder due at 08:00 UTC, for a loop built from one session. */
  const reminder = (overrides: Record<string, unknown> = {}) => ({
    id: 'lr-1',
    userId: 'u1',
    loopId: 'loop-1',
    morningTime: '08:00',
    eveningTime: null,
    timezone: 'UTC',
    user: { id: 'u1', pushTokens: ['tok'] },
    loop: { items: [{ affirmation: { sessionId: 'session-1' } }] },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      loopReminder: { findMany: jest.fn() },
      // No wave running unless a test says otherwise.
      wave: { findMany: jest.fn().mockResolvedValue([]) },
    };

    mockNotificationService = {
      notifyUser: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoopReminderService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: INotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<LoopReminderService>(LoopReminderService);
    jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends when the local time matches the reminder time', async () => {
    mockPrisma.loopReminder.findMany.mockResolvedValue([reminder()]);

    await service.sendLoopReminders();

    expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
    const call = mockNotificationService.notifyUser.mock.calls[0][0];
    expect(call.type).toBe(NotificationTypeEnum.AFFIRMATION_LOOP_REMINDER);
    expect(call.metadata.loopId).toBe('loop-1');
  });

  it('does not send when the time does not match', async () => {
    mockPrisma.loopReminder.findMany.mockResolvedValue([
      reminder({ morningTime: '09:00' }),
    ]);

    await service.sendLoopReminders();

    expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
  });

  it('reads the reminder time in its own timezone', async () => {
    // 08:00 UTC is 03:00 in New York, so a New York reminder isn't due.
    mockPrisma.loopReminder.findMany.mockResolvedValue([
      reminder({ timezone: 'America/New_York' }),
    ]);

    await service.sendLoopReminders();

    expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
  });

  // The wave's own reminder covers this loop and goes quiet once the day's
  // practice is done; this one can't tell, so sending both means a second
  // nudge for a play the user may already have made.
  describe('when a wave is running for the loop', () => {
    it('stays quiet', async () => {
      mockPrisma.loopReminder.findMany.mockResolvedValue([reminder()]);
      mockPrisma.wave.findMany.mockResolvedValue([{ sessionId: 'session-1' }]);

      await service.sendLoopReminders();

      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
    });

    it('still sends for a loop from a different session', async () => {
      mockPrisma.loopReminder.findMany.mockResolvedValue([reminder()]);
      mockPrisma.wave.findMany.mockResolvedValue([{ sessionId: 'session-2' }]);

      await service.sendLoopReminders();

      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
    });

    it('still sends for a loop that spans several sessions', async () => {
      // No single session means no wave can own it, so it keeps its reminder.
      mockPrisma.loopReminder.findMany.mockResolvedValue([
        reminder({
          loop: {
            items: [
              { affirmation: { sessionId: 'session-1' } },
              { affirmation: { sessionId: 'session-9' } },
            ],
          },
        }),
      ]);
      mockPrisma.wave.findMany.mockResolvedValue([{ sessionId: 'session-1' }]);

      await service.sendLoopReminders();

      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
    });
  });

  it('skips a user with no push tokens', async () => {
    mockPrisma.loopReminder.findMany.mockResolvedValue([
      reminder({ user: { id: 'u1', pushTokens: [] } }),
    ]);

    await service.sendLoopReminders();

    expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
  });

  it('does not throw when a notification fails', async () => {
    mockPrisma.loopReminder.findMany.mockResolvedValue([reminder()]);
    mockNotificationService.notifyUser.mockRejectedValue(
      new Error('push failed'),
    );

    await expect(service.sendLoopReminders()).resolves.toBeUndefined();
  });
});
