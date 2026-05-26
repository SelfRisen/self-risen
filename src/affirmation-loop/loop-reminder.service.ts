import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { DatabaseProvider } from 'src/database/database.provider';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';
import {
    NotificationChannelTypeEnum,
    NotificationTypeEnum,
} from 'src/notifications/enums/notification.enum';
import { DEFAULT_LOOP_REMINDER_TIMES } from './loop-reminder.constants';

const MAX_USERS_PER_RUN = 500;
const NOTIFY_BATCH_SIZE = 25;

function chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

function getCurrentTimeInZone(
    timezone: string,
    now?: Date,
): { hour: number; timeStr: string } {
    const instant = now ?? new Date();
    const parts = instant
        .toLocaleString('en-CA', {
            timeZone: timezone,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
        })
        .split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return { hour, timeStr };
}

function getLoopReminderMessage(hour: number): { title: string; body: string; reminderKind: string } {
    const isMorning = hour >= 5 && hour < 12;
    if (isMorning) {
        return {
            title: 'Morning affirmation loop',
            body: 'Start your day with your affirmation audio loop.',
            reminderKind: 'morning',
        };
    }
    return {
        title: 'Evening affirmation loop',
        body: 'Wind down with your affirmation audio loop.',
        reminderKind: 'evening',
    };
}

@Injectable()
export class LoopReminderService {
    private readonly logger = new Logger(LoopReminderService.name);

    constructor(
        private readonly prisma: DatabaseProvider,
        private readonly notificationService: INotificationService,
    ) {}

    /** Every minute: match user's local time against custom times or defaults (08:00, 20:00). */
    @Cron('* * * * *')
    async sendLoopReminders() {
        const now = new Date();
        const dateKey = now.toISOString().slice(0, 10);

        const users = await this.prisma.user.findMany({
            where: {
                loopReminderEnabled: true,
                pushTokens: { isEmpty: false },
            },
            select: {
                id: true,
                timezone: true,
                loopReminderTimes: true,
            },
            orderBy: { id: 'asc' },
            take: MAX_USERS_PER_RUN,
        });

        type UserToNotify = { id: string; hour: number; reminderKind: string; title: string; body: string };
        const toNotify: UserToNotify[] = [];

        for (const user of users) {
            const tz = (user.timezone || 'UTC').trim() || 'UTC';
            const { hour, timeStr } = getCurrentTimeInZone(tz, now);
            const times =
                user.loopReminderTimes.length > 0
                    ? user.loopReminderTimes
                    : [...DEFAULT_LOOP_REMINDER_TIMES];

            if (!times.includes(timeStr)) {
                continue;
            }

            const { title, body, reminderKind } = getLoopReminderMessage(hour);
            toNotify.push({ id: user.id, hour, reminderKind, title, body });
        }

        for (const batch of chunk(toNotify, NOTIFY_BATCH_SIZE)) {
            const results = await Promise.allSettled(
                batch.map((user) =>
                    this.notificationService.notifyUser({
                        userId: user.id,
                        type: NotificationTypeEnum.AFFIRMATION_LOOP_REMINDER,
                        requestId: `loop-reminder-${user.id}-${dateKey}-${user.reminderKind}-${randomUUID()}`,
                        channels: [
                            { type: NotificationChannelTypeEnum.PUSH },
                            { type: NotificationChannelTypeEnum.IN_APP },
                        ],
                        metadata: {
                            title: user.title,
                            body: user.body,
                            reminderKind: user.reminderKind,
                            screen: 'AffirmationLoop',
                        },
                    }),
                ),
            );

            results.forEach((result, i) => {
                if (result.status === 'rejected') {
                    this.logger.warn(
                        `Loop reminder failed for user ${batch[i].id}: ${result.reason?.message ?? result.reason}`,
                    );
                }
            });
        }

        if (toNotify.length > 0) {
            this.logger.debug(`Loop reminders sent to ${toNotify.length} users`);
        }
    }
}
