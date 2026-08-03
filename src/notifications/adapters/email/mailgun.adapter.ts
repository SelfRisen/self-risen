import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';
import { IEmailChannelAdapter } from '../../interfaces/adapter.interface';
import {
  NotificationChannelRequest,
  NotificationChannelResponse,
} from '../../interfaces/adapter.interface';
import { NotificationStatusEnum } from '../../enums/notification.enum';

@Injectable()
export class MailgunAdapter extends IEmailChannelAdapter {
  readonly name = 'Mailgun';
  private mailgun: Mailgun;
  private mg: any;

  constructor(private configService: ConfigService) {
    super();
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');

    if (apiKey && domain) {
      this.mailgun = new Mailgun(FormData);
      this.mg = this.mailgun.client({
        username: 'api',
        key: apiKey,
      });
    }
  }

  async send(
    request: NotificationChannelRequest,
  ): Promise<NotificationChannelResponse> {
    try {
      const domain = this.configService.get<string>('MAILGUN_DOMAIN');
      const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL');

      if (!domain || !fromEmail) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: 'Mailgun configuration missing',
        };
      }

      if (!this.mg) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: 'Mailgun client not initialized',
        };
      }

      const messageData = {
        from: fromEmail,
        to: request.recipient,
        subject: request.title,
        text: request.body,
        html: request.htmlBody || request.body,
      };

      const response = await this.mg.messages.create(domain, messageData);

      return {
        status: NotificationStatusEnum.SENT,
        messageId: response.id,
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
      const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
      const domain = this.configService.get<string>('MAILGUN_DOMAIN');
      return Promise.resolve(!!(apiKey && domain && this.mg));
    } catch {
      return Promise.resolve(false);
    }
  }
}
