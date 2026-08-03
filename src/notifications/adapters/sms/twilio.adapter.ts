import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { ISmsChannelAdapter } from '../../interfaces/adapter.interface';
import {
  NotificationChannelRequest,
  NotificationChannelResponse,
} from '../../interfaces/adapter.interface';
import { NotificationStatusEnum } from '../../enums/notification.enum';

@Injectable()
export class TwilioAdapter extends ISmsChannelAdapter {
  readonly name = 'Twilio';
  private client: Twilio | undefined;
  private readonly SMS_CHAR_LIMIT = 160;

  constructor(private configService: ConfigService) {
    super();
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (accountSid && authToken && accountSid.startsWith('AC')) {
      this.client = new Twilio(accountSid, authToken);
    }
  }

  async send(
    request: NotificationChannelRequest,
  ): Promise<NotificationChannelResponse> {
    try {
      if (!this.client) {
        return {
          status: NotificationStatusEnum.FAILED,
          error:
            'Twilio client not initialized. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN configuration.',
        };
      }

      const phoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER');

      if (!phoneNumber) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: 'Twilio phone number not configured',
        };
      }

      // Truncate body to SMS limit
      const body = request.body.substring(0, this.SMS_CHAR_LIMIT);

      const message = await this.client.messages.create({
        body,
        from: phoneNumber,
        to: request.recipient,
      });

      return {
        status: NotificationStatusEnum.SENT,
        messageId: message.sid,
      };
    } catch (error) {
      return {
        status: NotificationStatusEnum.FAILED,
        error: error.message || 'Unknown error',
      };
    }
  }

  healthCheck(): Promise<boolean> {
    try {
      return Promise.resolve(!!this.client);
    } catch {
      return Promise.resolve(false);
    }
  }
}
