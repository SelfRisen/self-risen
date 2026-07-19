import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import * as nodemailer from 'nodemailer/lib/mailer';
import { IEmailChannelAdapter } from '../../interfaces/adapter.interface';
import {
  NotificationChannelRequest,
  NotificationChannelResponse,
} from '../../interfaces/adapter.interface';
import { NotificationStatusEnum } from '../../enums/notification.enum';

@Injectable()
export class GmailAdapter extends IEmailChannelAdapter {
  readonly name = 'Gmail';
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    super();
    const mailUsername = this.configService.get<string>('MAIL_USERNAME');
    const oauthClientId = this.configService.get<string>('OAUTH_CLIENTID');
    const oauthClientSecret = this.configService.get<string>(
      'OAUTH_CLIENT_SECRET',
    );
    const oauthRefreshToken = this.configService.get<string>(
      'OAUTH_REFRESH_TOKEN',
    );

    if (
      mailUsername &&
      oauthClientId &&
      oauthClientSecret &&
      oauthRefreshToken
    ) {
      this.transporter = createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: mailUsername,
          clientId: oauthClientId,
          clientSecret: oauthClientSecret,
          refreshToken: oauthRefreshToken,
        },
        // Timeout configurations to prevent hanging in production
        connectionTimeout: 10000, // 10 seconds to establish connection
        socketTimeout: 30000, // 30 seconds for socket operations
        greetingTimeout: 10000, // 10 seconds for SMTP greeting
        // Pool connections for better performance
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
      });
    }
  }

  async send(
    request: NotificationChannelRequest,
  ): Promise<NotificationChannelResponse> {
    try {
      const mailUsername = this.configService.get<string>('MAIL_USERNAME');
      const oauthClientId = this.configService.get<string>('OAUTH_CLIENTID');
      const oauthClientSecret = this.configService.get<string>(
        'OAUTH_CLIENT_SECRET',
      );
      const oauthRefreshToken = this.configService.get<string>(
        'OAUTH_REFRESH_TOKEN',
      );

      if (!mailUsername) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: 'Gmail configuration missing: MAIL_USERNAME',
        };
      }

      // Re-initialize transporter if not initialized or credentials changed
      if (
        !this.transporter ||
        !oauthClientId ||
        !oauthClientSecret ||
        !oauthRefreshToken
      ) {
        if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
          this.transporter = createTransport({
            service: 'gmail',
            auth: {
              type: 'OAuth2',
              user: mailUsername,
              clientId: oauthClientId,
              clientSecret: oauthClientSecret,
              refreshToken: oauthRefreshToken,
            },
            connectionTimeout: 10000,
            socketTimeout: 30000,
            greetingTimeout: 10000,
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
          });
        } else {
          return {
            status: NotificationStatusEnum.FAILED,
            error:
              'Gmail client not initialized. Missing OAuth credentials (OAUTH_CLIENTID, OAUTH_CLIENT_SECRET, or OAUTH_REFRESH_TOKEN).',
          };
        }
      }

      const mailOptions = {
        from: 'Self-Risen',
        to: request.recipient,
        subject: request.title,
        html: request.htmlBody || request.body,
        text: request.body,
      };

      // Add timeout wrapper to prevent indefinite hanging
      const response = await Promise.race([
        this.transporter.sendMail(mailOptions),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error('Email send timeout: Operation exceeded 30 seconds'),
              ),
            30000,
          ),
        ),
      ]);

      return {
        status: NotificationStatusEnum.SENT,
        messageId: response.messageId,
      };
    } catch (error: any) {
      // Log the actual error for debugging
      console.error('[GmailAdapter] Send error:', {
        code: error?.code,
        message: error?.message,
        response: error?.response,
        command: error?.command,
      });

      // Handle timeout errors
      if (
        error?.message?.includes('timeout') ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ESOCKETTIMEDOUT' ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ENOTFOUND'
      ) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: `Email send timed out or connection failed. Check network connectivity and Gmail OAuth credentials. Original error: ${error?.code || error?.message}`,
        };
      }

      // Handle OAuth authentication errors
      if (
        error?.code === 'EAUTH' ||
        error?.message?.includes('invalid_grant') ||
        error?.message?.includes('unauthorized')
      ) {
        return {
          status: NotificationStatusEnum.FAILED,
          error: `Gmail OAuth authentication failed. Please verify your OAuth refresh token is valid and not expired. Error: ${error?.message || String(error)}`,
        };
      }

      return {
        status: NotificationStatusEnum.FAILED,
        error: error?.message || String(error) || 'Unknown error',
      };
    }
  }

  healthCheck(): Promise<boolean> {
    try {
      const mailUsername = this.configService.get<string>('MAIL_USERNAME');
      const oauthClientId = this.configService.get<string>('OAUTH_CLIENTID');
      const oauthClientSecret = this.configService.get<string>(
        'OAUTH_CLIENT_SECRET',
      );
      const oauthRefreshToken = this.configService.get<string>(
        'OAUTH_REFRESH_TOKEN',
      );

      return Promise.resolve(
        !!(
          mailUsername &&
          oauthClientId &&
          oauthClientSecret &&
          oauthRefreshToken &&
          this.transporter
        ),
      );
    } catch {
      return Promise.resolve(false);
    }
  }
}
