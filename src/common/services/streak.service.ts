import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { DatabaseProvider } from 'src/database/database.provider';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';
import {
  StreakCalendarResponse,
  StreakChartResponse,
  StreakChartMonth,
} from 'src/user/dto/streak-visualization.dto';

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  private readonly MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  constructor(
    private prisma: DatabaseProvider,
    private notificationService: INotificationService,
  ) {}

  /**
   * The user's local calendar day for an instant, at UTC midnight so days
   * compare cleanly wherever they were recorded.
   */
  private localCalendarDay(instant: Date, timeZone?: string | null): Date {
    let ymd: string;
    try {
      ymd = new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone || 'UTC',
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
   * Extends the user's streak for today.
   *
   * Called when the user actually practises -- a streak is meant to say they
   * showed up for the work, not that they opened the app. Days are the user's
   * local days, so practising late at night counts for the day they think it
   * does rather than the server's.
   */
  async updateStreak(user: User) {
    const today = this.localCalendarDay(new Date(), user.timezone);
    const lastStreakDate = user.lastStreakDate
      ? this.localCalendarDay(user.lastStreakDate, user.timezone)
      : null;

    const yesterday = new Date(today.getTime() - 86_400_000);

    let streak = user.streak;
    let shouldRecordHistory = false;

    await this.prisma.$transaction(async (tx) => {
      if (!lastStreakDate) {
        streak = 1;
        shouldRecordHistory = true;
        await tx.user.update({
          where: { id: user.id },
          data: {
            streak,
            lastStreakDate: today,
          },
        });
      } else if (lastStreakDate.getTime() === yesterday.getTime()) {
        streak = user.streak + 1;
        shouldRecordHistory = true;
        await tx.user.update({
          where: { id: user.id },
          data: {
            streak,
            lastStreakDate: today,
          },
        });
      } else if (lastStreakDate.getTime() === today.getTime()) {
        // Already logged in today - no update needed
        return;
      } else {
        // Streak broken - reset to 1
        streak = 1;
        shouldRecordHistory = true;
        await tx.user.update({
          where: { id: user.id },
          data: {
            streak,
            lastStreakDate: today,
          },
        });
      }

      if (shouldRecordHistory) {
        await this.recordStreakHistory(user.id, today, streak, tx);
      }
    });
  }

  private async recordStreakHistory(
    userId: string,
    date: Date,
    streak: number,
    tx?: Pick<DatabaseProvider, 'streakHistory'>,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.streakHistory.upsert({
      where: {
        userId_date: {
          userId,
          date,
        },
      },
      update: {
        streak,
      },
      create: {
        userId,
        date,
        streak,
      },
    });
  }

  async getStreakCalendar(
    userId: string,
    year: number,
    month: number,
  ): Promise<StreakCalendarResponse> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999);

    const streakHistory = await this.prisma.streakHistory.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    const days = streakHistory.map((record) => ({
      date: record.date.toISOString().split('T')[0],
      dayOfMonth: record.date.getDate(),
      streak: record.streak,
    }));

    return {
      year,
      month,
      totalActiveDays: days.length,
      days,
    };
  }

  async getStreakChart(
    userId: string,
    year: number,
  ): Promise<StreakChartResponse> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    const streakHistory = await this.prisma.streakHistory.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        date: true,
      },
    });

    const monthCounts = new Map<number, number>();
    for (let i = 1; i <= 12; i++) {
      monthCounts.set(i, 0);
    }

    for (const record of streakHistory) {
      const monthNumber = record.date.getMonth() + 1;
      monthCounts.set(monthNumber, (monthCounts.get(monthNumber) || 0) + 1);
    }

    const months: StreakChartMonth[] = [];
    let totalStreakDays = 0;

    for (let i = 1; i <= 12; i++) {
      const streakDays = monthCounts.get(i) || 0;
      totalStreakDays += streakDays;
      months.push({
        month: this.MONTH_NAMES[i - 1],
        monthNumber: i,
        streakDays,
      });
    }

    return {
      year,
      totalStreakDays,
      months,
    };
  }

  /**
   * Check if streak value is a milestone (10, 50, 100, or multiple of 50)
   */
}
