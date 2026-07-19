import {
  NotificationChannelTypeEnum,
  NotificationStatusEnum,
} from '../enums/notification.enum';

export interface NotificationChannelRequest {
  recipient: string; // email, phone, deviceToken, etc.
  title: string;
  body: string;
  htmlBody?: string;
  metadata?: Record<string, any>;
  requestId: string;
}

export interface NotificationChannelResponse {
  status: NotificationStatusEnum;
  messageId?: string;
  error?: string;
}

export abstract class INotificationChannelAdapter {
  abstract readonly name: string;
  abstract readonly channel: NotificationChannelTypeEnum;

  abstract send(
    request: NotificationChannelRequest,
  ): Promise<NotificationChannelResponse>;
  abstract healthCheck(): Promise<boolean>;
}

export abstract class IEmailChannelAdapter extends INotificationChannelAdapter {
  readonly channel = NotificationChannelTypeEnum.EMAIL;
}

export abstract class ISmsChannelAdapter extends INotificationChannelAdapter {
  readonly channel = NotificationChannelTypeEnum.SMS;
}

export abstract class IPushChannelAdapter extends INotificationChannelAdapter {
  readonly channel = NotificationChannelTypeEnum.PUSH;
}
