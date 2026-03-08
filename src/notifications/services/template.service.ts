import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as DOMPurify from 'isomorphic-dompurify';
import {
  NotificationTypeEnum,
  NotificationChannelTypeEnum,
} from '../enums/notification.enum';

export interface ResolvedTemplateData {
  templateId: string;
  subject: string;
  content: string;
  htmlBody?: string;
  variables: string[];
}

@Injectable()
export class TemplateService {
  private readonly TEMPLATE_DIR = path.join(__dirname, '../templates');
  private readonly FALLBACK_TEMPLATE = `
    <html>
      <body>
        <h1>\${title}</h1>
        <p>\${body}</p>
      </body>
    </html>
  `;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    // Ensure template directory exists
    if (!fs.existsSync(this.TEMPLATE_DIR)) {
      fs.mkdirSync(this.TEMPLATE_DIR, { recursive: true });
    }
  }

  async resolveTemplate(
    type: NotificationTypeEnum,
    channel: NotificationChannelTypeEnum,
    metadata: Record<string, any>,
  ): Promise<ResolvedTemplateData> {
    const templateId = this.getTemplateId(type, channel);
    const templateContent = await this.getTemplateContent(templateId, channel);

    // Sanitize metadata before substitution
    const sanitizedMetadata = this.sanitizeMetadata(metadata);
    const rendered = this.substituteVariables(templateContent, sanitizedMetadata);

    return {
      templateId,
      subject: sanitizedMetadata.title || type,
      content: rendered,
      htmlBody:
        channel === NotificationChannelTypeEnum.EMAIL ? rendered : undefined,
      variables: Object.keys(sanitizedMetadata),
    };
  }

  private getTemplateId(
    type: NotificationTypeEnum,
    channel: NotificationChannelTypeEnum,
  ): string {
    // Map notification type + channel to template ID
    const mapping: Record<string, string> = {
      [`${NotificationTypeEnum.USER_ONBOARDING_WELCOME}_${NotificationChannelTypeEnum.EMAIL}`]:
        'email_user_onboarding_welcome',
      [`${NotificationTypeEnum.USER_ONBOARDING_WELCOME}_${NotificationChannelTypeEnum.SMS}`]:
        'sms_user_onboarding_welcome',
      [`${NotificationTypeEnum.USER_ONBOARDING_WELCOME}_${NotificationChannelTypeEnum.PUSH}`]:
        'push_user_onboarding_welcome',
      [`${NotificationTypeEnum.PASSWORD_RESET_OTP}_${NotificationChannelTypeEnum.EMAIL}`]:
        'email_password_reset_otp',
      [`${NotificationTypeEnum.PASSWORD_RESET_CONFIRMATION}_${NotificationChannelTypeEnum.EMAIL}`]:
        'email_password_reset_confirmation',
    };

    return (
      mapping[`${type}_${channel}`] ||
      `default_${channel.toLowerCase()}`
    );
  }

  private async getTemplateContent(
    templateId: string,
    channel: NotificationChannelTypeEnum,
  ): Promise<string> {
    const cacheKey = `template:${templateId}:${channel}`;

    let content = await this.cacheManager.get<string>(cacheKey);
    if (content) {
      return content;
    }

    const filename =
      channel === NotificationChannelTypeEnum.EMAIL
        ? `${templateId}.html`
        : `${templateId}.txt`;

    const templatePath = path.join(this.TEMPLATE_DIR, filename);

    try {
      if (fs.existsSync(templatePath)) {
        content = await fs.promises.readFile(templatePath, 'utf-8');
        await this.cacheManager.set(cacheKey, content, 3600000); // 1 hour cache
        return content;
      } else {
        // Return fallback template
        return this.FALLBACK_TEMPLATE;
      }
    } catch (error) {
      // Return fallback template
      return this.FALLBACK_TEMPLATE;
    }
  }

  private substituteVariables(
    template: string,
    metadata: Record<string, any>,
  ): string {
    let result = template;

    // Simple variable substitution: ${variableName}
    Object.entries(metadata).forEach(([key, value]) => {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value));
    });

    return result;
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    return Object.entries(metadata).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = DOMPurify.sanitize(value);
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
  }
}

