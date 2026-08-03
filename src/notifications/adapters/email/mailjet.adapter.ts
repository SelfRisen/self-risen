import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailjet from 'node-mailjet';
import { IEmailChannelAdapter } from '../../interfaces/adapter.interface';
import {
  NotificationChannelRequest,
  NotificationChannelResponse,
} from '../../interfaces/adapter.interface';
import { NotificationStatusEnum } from '../../enums/notification.enum';

@Injectable()
export class MailjetAdapter extends IEmailChannelAdapter {
  readonly name = 'Mailjet';
  private mailjet: Mailjet;

  constructor(private configService: ConfigService) {
    super();
    const apiKey = this.configService.get<string>('MAILJET_API_KEY');
    const secretKey = this.configService.get<string>('MAILJET_SECRET_KEY');

    if (apiKey && secretKey) {
      this.mailjet = new Mailjet({
        apiKey,
        apiSecret: secretKey,
      });
    }
  }

  async send(
    request: NotificationChannelRequest,
  ): Promise<NotificationChannelResponse> {
    try {
      const fromEmail = this.configService.get<string>('MAILJET_FROM_EMAIL');
      const fromName =
        this.configService.get<string>('MAILJET_FROM_NAME') || 'Self-Risen';

      if (!fromEmail) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: 'Mailjet configuration missing: MAILJET_FROM_EMAIL',
        };
      }

      if (!this.mailjet) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: 'Mailjet client not initialized',
        };
      }

      const response = await this.mailjet
        .post('send', { version: 'v3.1' })
        .request({
          Messages: [
            {
              From: {
                Email: fromEmail,
                Name: fromName,
              },
              To: [
                {
                  Email: request.recipient,
                },
              ],
              Subject: request.title,
              TextPart: request.body,
              HTMLPart: request.htmlBody || request.body,
            },
          ],
        });

      const responseBody = response.body as any;
      const messageId = responseBody?.Messages?.[0]?.To?.[0]?.MessageID;

      return {
        status: NotificationStatusEnum.SENT,
        messageId: messageId?.toString(),
      };
    } catch (error: any) {
      return {
        status: NotificationStatusEnum.FAILED,
        error: error.message || 'Unknown error',
      };
    }
  }

  healthCheck(): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>('MAILJET_API_KEY');
      const secretKey = this.configService.get<string>('MAILJET_SECRET_KEY');
      const fromEmail = this.configService.get<string>('MAILJET_FROM_EMAIL');
      return Promise.resolve(
        !!(apiKey && secretKey && fromEmail && this.mailjet),
      );
    } catch {
      return Promise.resolve(false);
    }
  }
}
