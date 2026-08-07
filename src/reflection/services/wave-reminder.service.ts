import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseProvider } from 'src/database/database.provider';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';
import {
  NotificationScreenEnum,
  NotificationTypeEnum,
  NotificationChannelTypeEnum,
} from 'src/notifications/enums/notification.enum';
import { randomUUID } from 'crypto';

const MAX_USERS_PER_RUN = 500;
const NOTIFY_BATCH_SIZE = 25;

/** Current hour in a timezone as "HH:00", matching how reminder times are stored. */
function currentHourLabel(timezone: string, now: Date): string {
  try {
    const hour = now.toLocaleString('en-CA', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
    });
    return `${hour.padStart(2, '0')}:00`;
  } catch {
    return `${String(now.getUTCHours()).padStart(2, '0')}:00`;
  }
}

/** The user's local calendar day at UTC midnight, matching how check-ins are keyed. */
function localCalendarDay(instant: Date, timezone: string): Date {
  let ymd: string;
  try {
    ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    ymd = instant.toISOString().slice(0, 10);
  }
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Nudges people to practise while a wave day is still open.
 *
 * Deliberately quiet: one notification per reminder time no matter how many
 * waves are running, and nothing at all once the day is closed.
 */
@Injectable()
export class WaveReminderService {
  private readonly logger = new Logger(WaveReminderService.name);

  constructor(
    private readonly prisma: DatabaseProvider,
    private readonly notificationService: INotificationService,
  ) {}

  /** Hourly; sends to users whose local time matches one of their reminder times. */
  @Cron('0 * * * *')
  async sendPracticeReminders() {
    const now = new Date();

    const waves = await this.prisma.wave.findMany({
      where: {
        isActive: true,
        reminderTimes: { isEmpty: false },
        session: { user: { pushTokens: { isEmpty: false } } },
      },
      select: {
        id: true,
        cadence: true,
        durationDays: true,
        startDate: true,
        reminderTimes: true,
        session: {
          select: { user: { select: { id: true, timezone: true } } },
        },
      },
      orderBy: { id: 'asc' },
      take: MAX_USERS_PER_RUN,
    });

    if (waves.length === 0) return;

    // Several waves can run at once, so collapse to one nudge per user --
    // three waves must never mean three buzzes at the same minute.
    const dueByUser = new Map<
      string,
      { userId: string; waveIds: string[]; timezone: string }
    >();

    for (const wave of waves) {
      const user = wave.session.user;
      const tz = (user.timezone || 'UTC').trim() || 'UTC';
      if (!wave.reminderTimes.includes(currentHourLabel(tz, now))) continue;

      const today = localCalendarDay(now, tz);
      const checkIn = await this.prisma.waveCheckIn.findUnique({
        where: { waveId_date: { waveId: wave.id, date: today } },
        select: { completedAt: true },
      });

      // Silence once the day is closed -- that's the whole point of the nudge.
      if (checkIn?.completedAt) continue;

      const existing = dueByUser.get(user.id);
      if (existing) {
        existing.waveIds.push(wave.id);
      } else {
        dueByUser.set(user.id, {
          userId: user.id,
          waveIds: [wave.id],
          timezone: tz,
        });
      }
    }

    if (dueByUser.size === 0) return;

    const dateKey = now.toISOString().slice(0, 10);
    const due = [...dueByUser.values()];

    for (let i = 0; i < due.length; i += NOTIFY_BATCH_SIZE) {
      const batch = due.slice(i, i + NOTIFY_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((entry) => {
          const many = entry.waveIds.length > 1;
          return this.notificationService.notifyUser({
            userId: entry.userId,
            type: NotificationTypeEnum.WAVE_PRACTICE_REMINDER,
            requestId: `wave-practice-${entry.userId}-${dateKey}-${currentHourLabel(entry.timezone, now)}-${randomUUID()}`,
            channels: [
              { type: NotificationChannelTypeEnum.PUSH },
              { type: NotificationChannelTypeEnum.IN_APP },
            ],
            metadata: {
              title: 'Your practice is waiting',
              body: many
                ? `You have ${entry.waveIds.length} waves still open today.`
                : 'Play your loop to close out today.',
              screen: NotificationScreenEnum.WAVE,
              waveIds: entry.waveIds,
            },
          });
        }),
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        this.logger.warn(`${failed} wave practice reminder(s) failed to send`);
      }
    }

    this.logger.log(`Sent wave practice reminders to ${due.length} user(s)`);
  }
}
