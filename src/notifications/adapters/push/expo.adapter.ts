import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Expo } from 'expo-server-sdk';
import { IPushChannelAdapter } from '../../interfaces/adapter.interface';
import {
  NotificationChannelRequest,
  NotificationChannelResponse,
} from '../../interfaces/adapter.interface';
import { NotificationStatusEnum } from '../../enums/notification.enum';

@Injectable()
export class ExpoAdapter extends IPushChannelAdapter {
  readonly name = 'Expo';

  private readonly expo: Expo;

  constructor(private readonly configService: ConfigService) {
    super();
    const accessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
    this.expo = new Expo(accessToken ? { accessToken } : undefined);
  }

  async send(
    request: NotificationChannelRequest,
  ): Promise<NotificationChannelResponse> {
    const { recipient, title, body, metadata } = request;

    if (!Expo.isExpoPushToken(recipient)) {
      return {
        status: NotificationStatusEnum.FAILED,
        error: `Invalid Expo push token: ${recipient}`,
      };
    }

    const message = {
      to: recipient,
      title: title ?? '',
      body: body ?? '',
      data: metadata ?? {},
    };

    try {
      const chunks = this.expo.chunkPushNotifications([message]);
      const tickets: Awaited<ReturnType<Expo['sendPushNotificationsAsync']>> = [];

      for (const chunk of chunks) {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      }

      const ticket = tickets[0];
      if (!ticket) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: 'No ticket returned from Expo',
        };
      }

      if (ticket.status === 'error') {
        const errorMessage =
          ticket.message ?? ticket.details?.error ?? 'Unknown Expo error';
        return {
          status: NotificationStatusEnum.FAILED,
          error: errorMessage,
        };
      }

      return {
        status: NotificationStatusEnum.SENT,
        messageId: ticket.status === 'ok' && 'id' in ticket ? ticket.id : undefined,
      };
    } catch (error) {
      return {
        status: NotificationStatusEnum.FAILED,
        error: error?.message ?? 'Unknown error',
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
