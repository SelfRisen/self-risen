import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BaseService } from 'src/common';
import { DatabaseProvider } from 'src/database/database.provider';
import {
  RegisterPushTokenDto,
  RemovePushTokenDto,
  CreateManualNotificationDto,
} from './dto';
import {
  INotificationService,
  UserNotificationRequest,
  BulkUserNotificationRequest,
  ExternalUserNotificationRequest,
  NotificationResult,
  NotificationChannel,
  BulkNotificationResult,
} from './interfaces/notification.interface';
import { NotificationQueueService } from './services/notification-queue.service';
import { TemplateService } from './services/template.service';
import {
  NotificationChannelTypeEnum,
  NotificationStatusEnum,
  NotificationTypeEnum,
} from './enums/notification.enum';
import { randomUUID } from 'crypto';

@Injectable()
export class NotificationsService
  extends BaseService
  implements INotificationService {
  constructor(
    private prisma: DatabaseProvider,
    private dispatcher: NotificationQueueService,
    private templateService: TemplateService,
  ) {
    super();
  }

  async registerPushToken(firebaseId: string, payload: RegisterPushTokenDto) {
    const { pushToken } = payload;

    // Use transaction to avoid race condition
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { firebaseId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check for duplicate within transaction
      if (user.pushTokens.includes(pushToken)) {
        return user; // Return existing user without update
      }

      // Atomic push operation
      return await tx.user.update({
        where: { firebaseId },
        data: {
          pushTokens: {
            push: pushToken,
          },
        },
      });
    });

    return this.Results({
      message: 'Push token registered successfully',
      tokensCount: updatedUser.pushTokens.length,
    });
  }

  async removePushToken(firebaseId: string, payload: RemovePushTokenDto) {
    const { pushToken } = payload;

    // Use transaction to avoid race condition
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { firebaseId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Filter tokens within transaction to ensure atomicity
      const updatedTokens = user.pushTokens.filter((token) => token !== pushToken);

      return await tx.user.update({
        where: { firebaseId },
        data: {
          pushTokens: updatedTokens,
        },
      });
    });

    return this.Results({
      message: 'Push token removed successfully',
      tokensCount: updatedUser.pushTokens.length,
    });
  }

  /**
   * @deprecated Use notifyUser() instead - this method bypasses the queue system
   * and lacks proper audit logging. Kept for backward compatibility.
   */
  // async sendNotification(payload: SendNotificationDto) {
  //   const { firebaseId, title, body, data } = payload;

  //   const user = await this.prisma.user.findUnique({
  //     where: { firebaseId },
  //   });

  //   if (!user) {
  //     return this.HandleError(new NotFoundException('User not found'));
  //   }

  //   if (user.fcmTokens.length === 0) {
  //     return this.HandleError(
  //       new BadRequestException('User has no registered FCM tokens')
  //     );
  //   }

  //   const message: messaging.MulticastMessage = {
  //     tokens: user.fcmTokens,
  //     notification: {
  //       title,
  //       body,
  //     },
  //     data: data || {},
  //   };

  //   try {
  //     const response = await messaging().sendEachForMulticast(message);

  //     const failedTokens: string[] = [];
  //     response.responses.forEach((resp, idx) => {
  //       if (!resp.success) {
  //         failedTokens.push(user.fcmTokens[idx]);
  //       }
  //     });

  //     if (failedTokens.length > 0) {
  //       await this.prisma.user.update({
  //         where: { firebaseId },
  //         data: {
  //           fcmTokens: user.fcmTokens.filter(
  //             (token) => !failedTokens.includes(token)
  //           ),
  //         },
  //       });
  //     }

  //     return this.Results({
  //       message: 'Notification sent',
  //       successCount: response.successCount,
  //       failureCount: response.failureCount,
  //       removedInvalidTokens: failedTokens.length,
  //     });
  //   } catch (error) {
  //     return this.HandleError(error);
  //   }
  // }

  /**
   * @deprecated Use notifyBulkUsers() instead - this method bypasses the queue system
   * and lacks proper audit logging. Kept for backward compatibility.
   */
  // async sendBulkNotification(payload: SendBulkNotificationDto) {
  //   const { firebaseIds, title, body, data } = payload;

  //   const users = await this.prisma.user.findMany({
  //     where: {
  //       firebaseId: {
  //         in: firebaseIds,
  //       },
  //     },
  //   });

  //   if (users.length === 0) {
  //     return this.HandleError(new NotFoundException('No users found'));
  //   }

  //   const allTokens: string[] = [];
  //   users.forEach((user) => {
  //     allTokens.push(...user.fcmTokens);
  //   });

  //   if (allTokens.length === 0) {
  //     return this.HandleError(
  //       new BadRequestException('No FCM tokens available for the specified users')
  //     );
  //   }

  //   const message: messaging.MulticastMessage = {
  //     tokens: allTokens,
  //     notification: {
  //       title,
  //       body,
  //     },
  //     data: data || {},
  //   };

  //   try {
  //     const response = await messaging().sendEachForMulticast(message);

  //     return this.Results({
  //       message: 'Bulk notification sent',
  //       successCount: response.successCount,
  //       failureCount: response.failureCount,
  //       totalUsers: users.length,
  //       totalTokens: allTokens.length,
  //     });
  //   } catch (error) {
  //     return this.HandleError(error);
  //   }
  // }

  async getUserTokens(firebaseId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId },
      select: {
        pushTokens: true,
      },
    });

    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    return this.Results({
      tokens: user.pushTokens,
      count: user.pushTokens.length,
    });
  }

  /**
   * Manually create and send a notification to a user (in-app and optionally push/email/sms).
   * Uses the queue and audit logging. Recipient is identified by Firebase UID.
   */
  async createManualNotification(payload: CreateManualNotificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId: payload.recipientFirebaseId },
      select: { id: true },
    });

    if (!user) {
      return this.HandleError(
        new NotFoundException(
          `User not found for firebaseId: ${payload.recipientFirebaseId}`,
        ),
      );
    }

    const channels = payload.channels?.length
      ? payload.channels.map((type) => ({ type }))
      : undefined;

    const requestId = payload.requestId ?? `manual-${randomUUID()}`;
    const metadata = {
      title: payload.title,
      body: payload.body,
      ...payload.data,
    };

    const results = await this.notifyUser({
      userId: user.id,
      type: NotificationTypeEnum.MANUAL,
      requestId,
      channels,
      metadata,
    });

    return this.Results({ results });
  }

  // New notification methods implementing INotificationService
  async notifyUser(
    req: UserNotificationRequest,
  ): Promise<NotificationResult[]> {
    // Check for duplicate requestId (idempotency)
    const existing = await this.prisma.notification.findUnique({
      where: { requestId: req.requestId },
    });

    if (existing) {
      // Retrieve actual results from audit logs for this request
      const auditLogs = await this.prisma.notificationAuditLog.findMany({
        where: {
          requestId: req.requestId,
          recipientId: req.userId,
        },
      });

      // If we have audit logs, return those results
      if (auditLogs.length > 0) {
        return auditLogs.map((log) => ({
          channel: {
            type: log.channel as NotificationChannelTypeEnum,
            provider: log.provider,
          },
          status: log.status as NotificationStatusEnum,
          error: log.error || undefined,
        }));
      }

      // Fallback: reconstruct from notification record
      return existing.channels.map((channelType) => ({
        channel: { type: channelType as NotificationChannelTypeEnum },
        status: NotificationStatusEnum.SENT,
      }));
    }

    // Determine channels
    const channels = req.channels || this.getDefaultChannels(req.type);

    // Create notification and recipient in a transaction to ensure atomicity
    const notification = await this.prisma.$transaction(async (tx) => {
      // Create notification record
      const notif = await tx.notification.create({
        data: {
          type: req.type,
          title: req.metadata.title || req.type,
          body: req.metadata.body || '',
          channels: channels.map((c) => c.type),
          generatedByUserId: req.userId,
          meta: req.metadata,
          estateId: req.estateId,
          requestId: req.requestId,
        },
      });

      // Create recipient record (for in-app notifications)
      await tx.notificationRecipient.create({
        data: {
          notificationId: notif.id,
          recipientId: req.userId,
          isRead: false,
          isDismissed: false,
        },
      });

      return notif;
    });

    // Dispatch to external channels (outside transaction to avoid blocking)
    const results: NotificationResult[] = [];

    for (const channel of channels) {
      if (channel.type === NotificationChannelTypeEnum.IN_APP) {
        results.push({
          channel,
          status: NotificationStatusEnum.SENT, // Already saved to DB
        });
        continue;
      }

      // Resolve template
      const template = await this.templateService.resolveTemplate(
        req.type,
        channel.type,
        req.metadata,
      );

      // Get recipient info (email, phone, etc.)
      const recipientContact = await this.getRecipientContact(
        req.userId,
        channel.type,
      );

      if (!recipientContact) {
        results.push({
          channel,
          status: NotificationStatusEnum.FAILED,
          error: `No contact info found for channel ${channel.type}`,
        });
        continue;
      }

      // Dispatch to queue
      const result = await this.dispatcher.dispatch({
        notificationId: notification.id,
        userId: req.userId,
        channel: channel.type,
        recipient: recipientContact,
        title: template.subject,
        body: template.content,
        htmlBody: template.htmlBody,
        metadata: req.metadata,
        requestId: req.requestId,
        provider: channel.provider,
        notificationType: req.type,
      });

      results.push(result);
    }

    return results;
  }

  async notifyBulkUsers(
    req: BulkUserNotificationRequest,
  ): Promise<BulkNotificationResult> {
    // Validate array size to prevent DoS attacks
    if (!req.userIds || req.userIds.length === 0) {
      throw new BadRequestException('At least one user ID is required');
    }
    if (req.userIds.length > 1000) {
      throw new BadRequestException('Cannot send to more than 1000 users at once');
    }

    // Track failures
    const failures: Array<{
      userId: string;
      channel: NotificationChannelTypeEnum;
      reason: string;
    }> = [];
    const successfulUserChannels = new Set<string>(); // Track userId-channel combinations

    const notificationId = await this.prisma.$transaction(async (tx) => {
      // Create single notification
      const notification = await tx.notification.create({
        data: {
          type: req.type,
          title: req.metadata.title || req.type,
          body: req.metadata.body || '',
          channels: (req.channels || this.getDefaultChannels(req.type)).map(
            (c) => c.type,
          ),
          meta: req.metadata,
          requestId: req.requestId,
        },
      });

      // Create recipient records
      const recipients = req.userIds.map((userId) => ({
        notificationId: notification.id,
        recipientId: userId,
        isRead: false,
        isDismissed: false,
      }));

      await tx.notificationRecipient.createMany({
        data: recipients,
      });

      return notification.id;
    });

    // Dispatch to queue (after transaction commits to avoid blocking)
    const channels = req.channels || this.getDefaultChannels(req.type);

    for (const userId of req.userIds) {
      for (const channel of channels) {
        if (channel.type === NotificationChannelTypeEnum.IN_APP) {
          // IN_APP is already saved to DB, count as success
          successfulUserChannels.add(`${userId}-${channel.type}`);
          continue;
        }

        try {
          const template = await this.templateService.resolveTemplate(
            req.type,
            channel.type,
            req.metadata,
          );

          const recipientContact = await this.getRecipientContact(
            userId,
            channel.type,
          );

          if (!recipientContact) {
            failures.push({
              userId,
              channel: channel.type,
              reason: `No ${channel.type} contact info found for user`,
            });
            continue;
          }

          await this.dispatcher.dispatch({
            notificationId,
            userId,
            channel: channel.type,
            recipient: recipientContact,
            title: template.subject,
            body: template.content,
            htmlBody: template.htmlBody,
            metadata: req.metadata,
            requestId: req.requestId,
            provider: channel.provider,
            notificationType: req.type,
          });

          successfulUserChannels.add(`${userId}-${channel.type}`);
        } catch (error) {
          failures.push({
            userId,
            channel: channel.type,
            reason: error.message || 'Unknown error during dispatch',
          });
        }
      }
    }

    // Calculate unique users that had at least one success
    const successfulUsers = new Set(
      Array.from(successfulUserChannels).map((key) => key.split('-')[0]),
    ).size;

    return {
      success: true,
      notificationId,
      totalUsers: req.userIds.length,
      successfulUsers,
      failedUsers: req.userIds.length - successfulUsers,
      failures: failures.length > 0 ? failures : undefined,
    };
  }

  async notifyExternalUser(
    req: ExternalUserNotificationRequest,
  ): Promise<NotificationResult[]> {
    // Check for duplicate requestId (idempotency) using audit logs
    const existingAuditLogs = await this.prisma.notificationAuditLog.findMany({
      where: {
        requestId: req.requestId,
        type: 'EXTERNAL',
      },
    });

    if (existingAuditLogs.length > 0) {
      // Return existing results from audit logs
      return existingAuditLogs.map((log) => ({
        channel: {
          type: log.channel as NotificationChannelTypeEnum,
          provider: log.provider,
        },
        status: log.status as NotificationStatusEnum,
        error: log.error || undefined,
      }));
    }

    const channels = req.channels || [
      { type: NotificationChannelTypeEnum.EMAIL },
    ];
    const results: NotificationResult[] = [];

    for (const channel of channels) {
      const template = await this.templateService.resolveTemplate(
        req.type,
        channel.type,
        req.metadata,
      );

      const recipient =
        channel.type === NotificationChannelTypeEnum.EMAIL
          ? req.email
          : req.phone;

      if (!recipient) {
        results.push({
          channel,
          status: NotificationStatusEnum.FAILED,
          error: `No recipient info for channel ${channel.type}`,
        });
        continue;
      }

      const result = await this.dispatcher.dispatch({
        notificationId: 'external', // No DB record for external users
        channel: channel.type,
        recipient,
        title: template.subject,
        body: template.content,
        htmlBody: template.htmlBody,
        metadata: req.metadata,
        requestId: req.requestId,
        provider: channel.provider,
        notificationType: req.type,
      });

      results.push(result);
    }

    return results;
  }

  async getUserNotifications(firebaseId: string, page = 1, perPage = 10, unreadOnly = false) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId },
      select: { id: true },
    });

    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    const pageNumber = Math.max(1, Number(page) || 1);
    const perPageNumber = Math.max(1, Math.min(100, Number(perPage) || 10));
    const skip = (pageNumber - 1) * perPageNumber;

    // Build where clause with optional unreadOnly filter
    const whereClause: { recipientId: string; isRead?: boolean } = { recipientId: user.id };
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const [recipients, totalCount] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where: whereClause,
        include: {
          notification: {
            select: {
              id: true,
              type: true,
              title: true,
              body: true,
              channels: true,
              meta: true,
              createdAt: true,
              iconUrl: true,
              resourceId: true,
              resourceType: true,
              deepLink: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: perPageNumber,
        skip,
      }),
      this.prisma.notificationRecipient.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / perPageNumber);

    return this.Results({
      data: recipients,
      pagination: {
        page: pageNumber,
        limit: perPageNumber,
        total: totalCount,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1,
      },
    });
  }

  async markNotificationAsRead(firebaseId: string, notificationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId },
      select: { id: true },
    });

    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    try {
      const recipient = await this.prisma.notificationRecipient.findFirst({
        where: {
          recipientId: user.id,
          notificationId,
        },
      });

      if (!recipient) {
        return this.HandleError(new NotFoundException('Notification not found for this user'));
      }

      await this.prisma.notificationRecipient.update({
        where: {
          id: recipient.id,
        },
        data: { isRead: true },
      });

      return this.Results({ success: true });
    } catch (error) {
      return this.HandleError(
        new BadRequestException(`Failed to mark notification as read: ${error.message}`)
      );
    }
  }

  async markAllNotificationsAsRead(firebaseId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId },
      select: { id: true },
    });

    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    await this.prisma.notificationRecipient.updateMany({
      where: { recipientId: user.id },
      data: { isRead: true },
    });

    return this.Results({ success: true });
  }

  async countUnreadNotifications(firebaseId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseId },
      select: { id: true },
    });

    if (!user) {
      return this.HandleError(new NotFoundException('User not found'));
    }

    const count = await this.prisma.notificationRecipient.count({
      where: { recipientId: user.id, isRead: false },
    });

    return this.Results({ count });
  }

  private getDefaultChannels(type: NotificationTypeEnum): NotificationChannel[] {
    // Define default channels per notification type
    const defaults: Record<string, NotificationChannel[]> = {
      [NotificationTypeEnum.USER_ONBOARDING_WELCOME]: [
        { type: NotificationChannelTypeEnum.EMAIL },
        { type: NotificationChannelTypeEnum.PUSH },
        { type: NotificationChannelTypeEnum.IN_APP },
      ],
      [NotificationTypeEnum.STREAK_REMINDER]: [
        { type: NotificationChannelTypeEnum.PUSH },
        { type: NotificationChannelTypeEnum.IN_APP },
      ],
      [NotificationTypeEnum.MANUAL]: [
        { type: NotificationChannelTypeEnum.IN_APP },
      ],
    };

    return defaults[type] || [{ type: NotificationChannelTypeEnum.IN_APP }];
  }

  private async getRecipientContact(
    userId: string,
    channel: NotificationChannelTypeEnum,
  ): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        pushTokens: true,
      },
    });

    if (!user) {
      return null;
    }

    switch (channel) {
      case NotificationChannelTypeEnum.EMAIL:
        return user.email;
      // case NotificationChannelTypeEnum.SMS:
      //   return user.phone;
      case NotificationChannelTypeEnum.PUSH:
        // Return first push token, or null if none
        return user.pushTokens.length > 0 ? user.pushTokens[0] : null;
      default:
        return null;
    }
  }
}
