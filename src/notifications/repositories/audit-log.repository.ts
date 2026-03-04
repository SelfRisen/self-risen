import { Injectable } from '@nestjs/common';
import { DatabaseProvider } from 'src/database/database.provider';
import {
  NotificationChannelTypeEnum,
  NotificationStatusEnum,
} from '../enums/notification.enum';

export interface CreateAuditLogParams {
  requestId: string;
  type: string;
  notificationType: string;
  recipientId?: string; // Actual user ID (optional for external notifications)
  recipientContact: string; // Email, phone, or push token
  channel: NotificationChannelTypeEnum;
  provider: string;
  status: NotificationStatusEnum;
  metadata?: Record<string, any>;
}

export interface UpdateAuditLogParams {
  status?: NotificationStatusEnum;
  error?: string;
  sentAt?: Date;
}

export interface FindAuditLogOptions {
  requestId?: string;
  recipientId?: string;
  notificationType?: string;
  limit?: number;
}

@Injectable()
export class AuditLogRepository {
  constructor(private prisma: DatabaseProvider) {}

  async create(
    params: CreateAuditLogParams,
  ) {
    // For external notifications, use recipientContact as recipientId
    // For user notifications, use the actual userId
    const recipientId = params.recipientId || params.recipientContact;

    const log = await this.prisma.notificationAuditLog.create({
      data: {
        requestId: params.requestId,
        type: params.type,
        notificationType: params.notificationType,
        recipientId: recipientId,
        channel: params.channel,
        provider: params.provider,
        status: params.status,
        metadata: params.metadata || {},
      },
    });

    return log;
  }

  async update(id: string, params: UpdateAuditLogParams) {
    const log = await this.prisma.notificationAuditLog.update({
      where: { id },
      data: {
        status: params.status,
        error: params.error,
        sentAt: params.sentAt,
      },
    });

    return log;
  }

  async find(options: FindAuditLogOptions = {}) {
    const where: any = {};

    if (options.requestId) {
      where.requestId = options.requestId;
    }

    if (options.recipientId) {
      where.recipientId = options.recipientId;
    }

    if (options.notificationType) {
      where.notificationType = options.notificationType;
    }

    const logs = await this.prisma.notificationAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 100,
    });

    return logs;
  }
}

