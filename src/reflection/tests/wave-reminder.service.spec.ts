import { Test, TestingModule } from '@nestjs/testing';
import { WaveReminderService } from '../services/wave-reminder.service';
import { DatabaseProvider } from '../../database/database.provider';
import { INotificationService } from '../../notifications/interfaces/notification.interface';

describe('WaveReminderService', () => {
  let service: WaveReminderService;
  let mockPrisma: any;
  let mockNotifications: any;

  /** A UTC instant whose hour we control, so "is it 09:00 for this user" is deterministic. */
  const at = (hourUtc: number) => new Date(Date.UTC(2026, 7, 5, hourUtc, 0, 0));

  const waveAt = (overrides: Record<string, unknown> = {}) => ({
    id: 'wave-1',
    cadence: 1,
    durationDays: 30,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    reminderTimes: ['09:00'],
    session: { user: { id: 'user-1', timezone: 'UTC' } },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockPrisma = {
      wave: { findMany: jest.fn().mockResolvedValue([]) },
      waveCheckIn: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockNotifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaveReminderService,
        { provide: DatabaseProvider, useValue: mockPrisma },
        { provide: INotificationService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<WaveReminderService>(WaveReminderService);
  });

  afterEach(() => jest.useRealTimers());

  it('nudges when the local hour matches and the day is still open', async () => {
    jest.setSystemTime(at(9));
    mockPrisma.wave.findMany.mockResolvedValue([waveAt()]);

    await service.sendPracticeReminders();

    expect(mockNotifications.notifyUser).toHaveBeenCalledTimes(1);
    expect(mockNotifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        metadata: expect.objectContaining({
          body: 'Play your loop to close out today.',
        }),
      }),
    );
  });

  it('stays silent once the day is closed', async () => {
    jest.setSystemTime(at(9));
    mockPrisma.wave.findMany.mockResolvedValue([waveAt()]);
    mockPrisma.waveCheckIn.findUnique.mockResolvedValue({
      completedAt: new Date(),
    });

    await service.sendPracticeReminders();

    expect(mockNotifications.notifyUser).not.toHaveBeenCalled();
  });

  it('still nudges on a partial day, since the day is not closed', async () => {
    jest.setSystemTime(at(9));
    mockPrisma.wave.findMany.mockResolvedValue([waveAt({ cadence: 2 })]);
    mockPrisma.waveCheckIn.findUnique.mockResolvedValue({ completedAt: null });

    await service.sendPracticeReminders();

    expect(mockNotifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the hour does not match a reminder time', async () => {
    jest.setSystemTime(at(14));
    mockPrisma.wave.findMany.mockResolvedValue([waveAt()]);

    await service.sendPracticeReminders();

    expect(mockNotifications.notifyUser).not.toHaveBeenCalled();
  });

  it('sends one notification for a user running several waves', async () => {
    jest.setSystemTime(at(9));
    mockPrisma.wave.findMany.mockResolvedValue([
      waveAt({ id: 'wave-1' }),
      waveAt({ id: 'wave-2' }),
      waveAt({ id: 'wave-3' }),
    ]);

    await service.sendPracticeReminders();

    // Three waves must not mean three buzzes at the same minute.
    expect(mockNotifications.notifyUser).toHaveBeenCalledTimes(1);
    expect(mockNotifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          body: 'You have 3 waves still open today.',
          waveIds: ['wave-1', 'wave-2', 'wave-3'],
        }),
      }),
    );
  });

  it("uses the user's own timezone to decide whether it is their reminder hour", async () => {
    // 13:00 UTC is 09:00 in New York during EDT.
    jest.setSystemTime(at(13));
    mockPrisma.wave.findMany.mockResolvedValue([
      waveAt({
        session: { user: { id: 'user-1', timezone: 'America/New_York' } },
      }),
    ]);

    await service.sendPracticeReminders();

    expect(mockNotifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('falls back to UTC rather than throwing on an unrecognised timezone', async () => {
    jest.setSystemTime(at(9));
    mockPrisma.wave.findMany.mockResolvedValue([
      waveAt({ session: { user: { id: 'user-1', timezone: 'Not/AZone' } } }),
    ]);

    await expect(service.sendPracticeReminders()).resolves.not.toThrow();
    expect(mockNotifications.notifyUser).toHaveBeenCalledTimes(1);
  });
});
