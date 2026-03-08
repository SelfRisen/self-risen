import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseProvider } from 'src/database/database.provider';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';
import { NotificationTypeEnum, NotificationChannelTypeEnum } from 'src/notifications/enums/notification.enum';
import { randomUUID } from 'crypto';

export type ReminderKind = 'morning' | 'afternoon' | 'evening';

const MORNING_MESSAGES: Array<(streak: number) => { title: string; body: string }> = [
  (n) => ({ title: `${n}-day streak 🔥`, body: "Start today right — one reflection or vision and you're golden." }),
  (n) => ({ title: `${n} days strong`, body: "Keep the momentum. Your morning check-in is waiting." }),
  (n) => ({ title: `Good morning, streak keeper`, body: `You're at ${n} days. Don't break the chain today.` }),
  (n) => ({ title: `${n} in a row`, body: "Quick reflection or vision board moment — you've got this." }),
];

const AFTERNOON_MESSAGES: Array<(streak: number) => { title: string; body: string }> = [
  (n) => ({ title: `${n}-day streak 🔥`, body: "Midday check-in: one reflection or vision and you're still on track." }),
  (n) => ({ title: `${n} days strong`, body: "Afternoon reminder: keep the streak alive with a quick reflection or vision." }),
  (n) => ({ title: `Streak check`, body: `You're at ${n} days. Sneak in a reflection or vision before the day gets away.` }),
  (n) => ({ title: `${n} in a row`, body: "A little reflection or vision board time now = streak intact. You've got this." }),
];

const EVENING_MESSAGES: Array<(streak: number) => { title: string; body: string }> = [
  (n) => ({ title: `${n}-day streak 🔥`, body: "One reflection or vision before bed and today counts." }),
  (n) => ({ title: `Don't let it slip`, body: `You're at ${n} days. Evening check-in? You've got this.` }),
  (n) => ({ title: `${n} days strong`, body: "Close the day with a quick reflection or vision. Keep the streak alive." }),
  (n) => ({ title: `Streak reminder`, body: `${n} days in a row. Add a reflection or vision and call it a win.` }),
];

const MESSAGE_MAP: Record<ReminderKind, Array<(streak: number) => { title: string; body: string }>> = {
  morning: MORNING_MESSAGES,
  afternoon: AFTERNOON_MESSAGES,
  evening: EVENING_MESSAGES,
};

const MAX_USERS_PER_RUN = 500;
// const MAX_USERS_PER_RUN = 5000;

const NOTIFY_BATCH_SIZE = 25;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Hour (0-23) -> morning | afternoon | evening. Night (0-4) treated as evening. */
function getKindFromHour(hour: number): ReminderKind {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** Current time in timezone as "HH:mm" (hour and minute). Pass optional now for a consistent snapshot. */
function getCurrentTimeInZone(timezone: string, now?: Date): { hour: number; minute: number; timeStr: string } {
  const instant = now ?? new Date();
  const parts = instant.toLocaleString('en-CA', { timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { hour, minute, timeStr };
}

@Injectable()
export class StreakReminderService {
  private readonly logger = new Logger(StreakReminderService.name);

  constructor(
    private readonly prisma: DatabaseProvider,
    private readonly notificationService: INotificationService,
  ) {}

  /** Default: 8:00 UTC – morning reminders for users with no custom times */
  @Cron('0 8 * * *')
  async sendDefaultMorningReminders() {
    await this.sendRemindersToDefaultUsers('morning');
  }

  /** Default: 18:00 UTC – evening reminders for users with no custom times */
  @Cron('0 18 * * *')
  async sendDefaultEveningReminders() {
    await this.sendRemindersToDefaultUsers('evening');
  }

  /** Every hour: custom-time users – if their local time matches a reminder time, send the right message (morning/afternoon/evening) */
  @Cron('0 * * * *')
  async sendCustomTimeReminders() {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);

    const users = await this.prisma.user.findMany({
      where: {
        streak: { gt: 0 },
        pushTokens: { isEmpty: false },
        streakReminderEnabled: true,
        streakReminderTimes: { isEmpty: false },
      },
      select: {
        id: true,
        streak: true,
        streakReminderTimes: true,
        timezone: true,
      },
      orderBy: { id: 'asc' },
      take: MAX_USERS_PER_RUN,
    });

    if (users.length === 0) {
      return;
    }

    type UserWithKind = (typeof users)[number] & { kind: ReminderKind; timeStr: string };
    const toNotify: UserWithKind[] = [];
    for (const user of users) {
      const times = user.streakReminderTimes ?? [];
      const tz = (user.timezone || 'UTC').trim() || 'UTC';
      const { hour, timeStr } = getCurrentTimeInZone(tz, now);

      // Match when current time in user's TZ is exactly HH:00 (cron runs at minute 0). User times are "HH:mm".
      const currentHourLabel = `${String(hour).padStart(2, '0')}:00`;
      if (!times.includes(currentHourLabel)) continue;
      toNotify.push({ ...user, kind: getKindFromHour(hour), timeStr });
    }

    for (const batch of chunk(toNotify, NOTIFY_BATCH_SIZE)) {
      const results = await Promise.allSettled(
        batch.map((user) => {
          const messages = MESSAGE_MAP[user.kind];
          const pick = messages[Math.floor(Math.random() * messages.length)];
          const { title, body } = pick(user.streak);
          const requestId = `streak-reminder-${user.id}-${dateKey}-${user.kind}-${user.timeStr}-${randomUUID()}`;
          return this.notificationService.notifyUser({
            userId: user.id,
            type: NotificationTypeEnum.STREAK_REMINDER,
            requestId,
            channels: [
              { type: NotificationChannelTypeEnum.PUSH },
              { type: NotificationChannelTypeEnum.IN_APP },
            ],
            metadata: {
              title,
              body,
              streak: user.streak,
              reminderKind: user.kind,
            },
          });
        }),
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          this.logger.warn(`Streak reminder failed for user ${batch[i].id}: ${result.reason?.message ?? result.reason}`);
        }
      });
    }

    this.logger.debug(`Custom streak reminders: processed ${users.length} users, sent to ${toNotify.length} with matching time`);
  }

  /** Send to users who use defaults: no custom times, reminders enabled, at fixed UTC 8 (morning) or 18 (evening). */
  private async sendRemindersToDefaultUsers(kind: ReminderKind) {
    const users = await this.prisma.user.findMany({
      where: {
        streak: { gt: 0 },
        pushTokens: { isEmpty: false },
        streakReminderEnabled: true,
        streakReminderTimes: { isEmpty: true },
      },
      select: { id: true, streak: true },
      orderBy: { id: 'asc' },
      take: MAX_USERS_PER_RUN,
    });

    if (users.length === 0) {
      this.logger.debug(`Streak reminders (${kind}, default): no eligible users`);
      return;
    }

    const messages = MESSAGE_MAP[kind];
    const dateKey = new Date().toISOString().slice(0, 10);

    for (const batch of chunk(users, NOTIFY_BATCH_SIZE)) {
      const results = await Promise.allSettled(
        batch.map((user) => {
          const pick = messages[Math.floor(Math.random() * messages.length)];
          const { title, body } = pick(user.streak);
          const requestId = `streak-reminder-${user.id}-${dateKey}-${kind}-${randomUUID()}`;
          return this.notificationService.notifyUser({
            userId: user.id,
            type: NotificationTypeEnum.STREAK_REMINDER,
            requestId,
            channels: [
              { type: NotificationChannelTypeEnum.PUSH },
              { type: NotificationChannelTypeEnum.IN_APP },
            ],
            metadata: {
              title,
              body,
              streak: user.streak,
              reminderKind: kind,
            },
          });
        }),
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          this.logger.warn(`Streak reminder failed for user ${batch[i].id}: ${result.reason?.message ?? result.reason}`);
        }
      });
    }

    this.logger.log(`Streak reminders (${kind}, default): sent to ${users.length} users`);
  }
}
