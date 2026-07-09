import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { DatabaseProvider } from 'src/database/database.provider';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';
import {
    NotificationChannelTypeEnum,
    NotificationTypeEnum,
} from 'src/notifications/enums/notification.enum';

const MAX_REMINDERS_PER_RUN = 500;
const NOTIFY_BATCH_SIZE = 25;

function chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

function getCurrentTimeInZone(timezone: string, now?: Date): string {
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
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

@Injectable()
export class LoopReminderService {
    private readonly logger = new Logger(LoopReminderService.name);

    constructor(
        private readonly prisma: DatabaseProvider,
        private readonly notificationService: INotificationService,
    ) {}

    /** Every minute: match each active LoopReminder's local time against its stored morning/evening times. */
    @Cron('* * * * *')
    async sendLoopReminders() {
        const now = new Date();
        const dateKey = now.toISOString().slice(0, 10);

        const reminders = await this.prisma.loopReminder.findMany({
            where: { isActive: true },
            include: {
                user: { select: { id: true, pushTokens: true } },
            },
            orderBy: { id: 'asc' },
            take: MAX_REMINDERS_PER_RUN,
        });

        type ToNotify = { userId: string; loopId: string; reminderKind: 'morning' | 'evening' };
        const toNotify: ToNotify[] = [];

        for (const reminder of reminders) {
            if (!reminder.user || reminder.user.pushTokens.length === 0) {
                continue;
            }

            const tz = (reminder.timezone || 'UTC').trim() || 'UTC';
            const timeStr = getCurrentTimeInZone(tz, now);

            if (reminder.morningTime && reminder.morningTime === timeStr) {
                toNotify.push({ userId: reminder.userId, loopId: reminder.loopId, reminderKind: 'morning' });
            }
            if (reminder.eveningTime && reminder.eveningTime === timeStr) {
                toNotify.push({ userId: reminder.userId, loopId: reminder.loopId, reminderKind: 'evening' });
            }
        }

        for (const batch of chunk(toNotify, NOTIFY_BATCH_SIZE)) {
            const results = await Promise.allSettled(
                batch.map((item) =>
                    this.notificationService.notifyUser({
                        userId: item.userId,
                        type: NotificationTypeEnum.AFFIRMATION_LOOP_REMINDER,
                        requestId: `loop-reminder-${item.loopId}-${dateKey}-${item.reminderKind}-${randomUUID()}`,
                        channels: [
                            { type: NotificationChannelTypeEnum.PUSH },
                            { type: NotificationChannelTypeEnum.IN_APP },
                        ],
                        metadata: {
                            title: 'Time for your affirmation loop',
                            body: 'Tap to start your session',
                            loopId: item.loopId,
                            screen: 'affirmation-loop',
                        },
                    }),
                ),
            );

            results.forEach((result, i) => {
                if (result.status === 'rejected') {
                    this.logger.warn(
                        `Loop reminder failed for user ${batch[i].userId}, loop ${batch[i].loopId}: ${result.reason?.message ?? result.reason}`,
                    );
                }
            });
        }

        if (toNotify.length > 0) {
            this.logger.debug(`Loop reminders sent for ${toNotify.length} loops`);
        }
    }
}
