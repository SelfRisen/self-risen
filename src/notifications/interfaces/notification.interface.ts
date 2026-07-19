import {
  NotificationChannelTypeEnum,
  NotificationTypeEnum,
  NotificationStatusEnum,
} from '../enums/notification.enum';

export interface NotificationChannel {
  type: NotificationChannelTypeEnum;
  provider?: string;
}

export interface NotificationResult {
  channel: NotificationChannel;
  status: NotificationStatusEnum;
  provider?: string;
  error?: string;
}

export interface UserNotificationRequest<T = Record<string, any>> {
  userId: string;
  type: NotificationTypeEnum;
  requestId: string;
  channels?: NotificationChannel[];
  metadata: T;
  estateId?: string;
}

export interface BulkUserNotificationRequest<T = Record<string, any>> {
  userIds: string[];
  type: NotificationTypeEnum;
  requestId: string;
  channels?: NotificationChannel[];
  metadata: T;
}

export interface ExternalUserNotificationRequest<T = Record<string, any>> {
  email?: string;
  phone?: string;
  type: NotificationTypeEnum;
  requestId: string;
  channels?: NotificationChannel[];
  metadata: T;
}

export interface BulkNotificationResult {
  success: true;
  notificationId: string;
  totalUsers: number;
  successfulUsers: number;
  failedUsers: number;
  failures?: Array<{
    userId: string;
    channel: NotificationChannelTypeEnum;
    reason: string;
  }>;
}

export abstract class INotificationService {
  abstract notifyUser(
    req: UserNotificationRequest,
  ): Promise<NotificationResult[]>;
  abstract notifyBulkUsers(
    req: BulkUserNotificationRequest,
  ): Promise<BulkNotificationResult>;
  abstract notifyExternalUser(
    req: ExternalUserNotificationRequest,
  ): Promise<NotificationResult[]>;
}
