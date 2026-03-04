import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DatabaseProvider } from 'src/database/database.provider';
import { NotificationQueueService } from './services/notification-queue.service';
import { TemplateService } from './services/template.service';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { DeadLetterQueueRepository } from './repositories/dead-letter-queue.repository';
import { MailgunAdapter } from './adapters/email/mailgun.adapter';
import { GmailAdapter } from './adapters/email/gmail.adapter';
import { MailjetAdapter } from './adapters/email/mailjet.adapter';
import { TwilioAdapter } from './adapters/sms/twilio.adapter';
import { ExpoAdapter } from './adapters/push/expo.adapter';
import { INotificationService } from './interfaces/notification.interface';
import { NotificationChannelTypeEnum } from './enums/notification.enum';
import { IEmailChannelAdapter } from './interfaces/adapter.interface';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisConfig: any = {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        };

        // Add password if provided (required for Railway Redis)
        const password = configService.get<string>('REDIS_PASSWORD');
        if (password) {
          redisConfig.password = password;
        }

        return { redis: redisConfig };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'notification_dispatch',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    CacheModule.register(),
  ],
  controllers: [NotificationsController],
  providers: [
    // Services
    {
      provide: INotificationService,
      useClass: NotificationsService,
    },
    NotificationsService,
    NotificationQueueService,
    TemplateService,
    AuditLogRepository,
    DeadLetterQueueRepository,
    DatabaseProvider,

    // Adapters
    MailgunAdapter,
    GmailAdapter,
    MailjetAdapter,
    TwilioAdapter,
    ExpoAdapter,

    // Adapter Registry
    {
      provide: 'NOTIFICATION_CHANNEL_ADAPTERS',
      useFactory: (
        mailgun: MailgunAdapter,
        gmail: GmailAdapter,
        mailjet: MailjetAdapter,
        twilio: TwilioAdapter,
        expo: ExpoAdapter,
        configService: ConfigService,
      ) => {
        const map = new Map();

        // Email adapters priority: Mailjet > Gmail > Mailgun
        const emailAdapters: IEmailChannelAdapter[] = [];
        const hasMailjetConfig =
          configService.get<string>('MAILJET_API_KEY') &&
          configService.get<string>('MAILJET_SECRET_KEY') &&
          configService.get<string>('MAILJET_FROM_EMAIL');

        const hasGmailConfig =
          configService.get<string>('MAIL_USERNAME') &&
          configService.get<string>('OAUTH_CLIENTID') &&
          configService.get<string>('OAUTH_CLIENT_SECRET') &&
          configService.get<string>('OAUTH_REFRESH_TOKEN');

        const hasMailgunConfig =
          configService.get<string>('MAILGUN_API_KEY') &&
          configService.get<string>('MAILGUN_DOMAIN') &&
          configService.get<string>('MAILGUN_FROM_EMAIL');

        if (hasMailjetConfig) {
          emailAdapters.push(mailjet);
        }
        if (hasGmailConfig) {
          emailAdapters.push(gmail);
        }
        if (hasMailgunConfig) {
          emailAdapters.push(mailgun);
        }

        // Default to Mailjet if no adapters configured (will fail gracefully)
        if (emailAdapters.length === 0) {
          emailAdapters.push(mailjet);
        }

        map.set(NotificationChannelTypeEnum.EMAIL, emailAdapters);
        map.set(NotificationChannelTypeEnum.SMS, [twilio]);
        map.set(NotificationChannelTypeEnum.PUSH, [expo]);
        return map;
      },
      inject: [
        MailgunAdapter,
        GmailAdapter,
        MailjetAdapter,
        TwilioAdapter,
        ExpoAdapter,
        ConfigService,
      ],
    },
  ],
  exports: [INotificationService, NotificationsService],
})
export class NotificationsModule { }
