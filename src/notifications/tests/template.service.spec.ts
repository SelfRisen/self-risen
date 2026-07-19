jest.mock('isomorphic-dompurify', () => ({
  // Minimal sanitizer: strip <script>…</script> so we can assert sanitization runs
  sanitize: (value: string) => value.replace(/<script[\s\S]*?<\/script>/gi, ''),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

import * as fs from 'fs';
import { TemplateService } from '../services/template.service';
import {
  NotificationChannelTypeEnum,
  NotificationTypeEnum,
} from '../enums/notification.enum';

describe('TemplateService', () => {
  let service: TemplateService;
  let cache: Map<string, string>;
  let mockCacheManager: any;

  const readFileMock = fs.promises.readFile as jest.Mock;
  const existsSyncMock = fs.existsSync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    existsSyncMock.mockReturnValue(true);
    cache = new Map();
    mockCacheManager = {
      get: jest.fn((key: string) => Promise.resolve(cache.get(key))),
      set: jest.fn((key: string, value: string) => {
        cache.set(key, value);
        return Promise.resolve();
      }),
    };
    service = new TemplateService(mockCacheManager);
  });

  it('renders an email template and substitutes variables', async () => {
    readFileMock.mockResolvedValueOnce('<h1>${title}</h1><p>${body}</p>');

    const result = await service.resolveTemplate(
      NotificationTypeEnum.USER_ONBOARDING_WELCOME,
      NotificationChannelTypeEnum.EMAIL,
      { title: 'Welcome', body: 'Glad you are here' },
    );

    expect(result.templateId).toBe('email_user_onboarding_welcome');
    expect(result.subject).toBe('Welcome');
    expect(result.content).toBe('<h1>Welcome</h1><p>Glad you are here</p>');
    expect(result.htmlBody).toBe('<h1>Welcome</h1><p>Glad you are here</p>');
    expect(result.variables).toEqual(expect.arrayContaining(['title', 'body']));
  });

  it('does not set htmlBody for non-email channels', async () => {
    readFileMock.mockResolvedValueOnce('Welcome ${title}');

    const result = await service.resolveTemplate(
      NotificationTypeEnum.USER_ONBOARDING_WELCOME,
      NotificationChannelTypeEnum.PUSH,
      { title: 'Friend' },
    );

    expect(result.templateId).toBe('push_user_onboarding_welcome');
    expect(result.htmlBody).toBeUndefined();
    expect(result.content).toBe('Welcome Friend');
  });

  it('reads the template from disk once, then serves from cache', async () => {
    readFileMock.mockResolvedValue('<p>${title}</p>');

    await service.resolveTemplate(
      NotificationTypeEnum.USER_ONBOARDING_WELCOME,
      NotificationChannelTypeEnum.EMAIL,
      { title: 'A' },
    );
    await service.resolveTemplate(
      NotificationTypeEnum.USER_ONBOARDING_WELCOME,
      NotificationChannelTypeEnum.EMAIL,
      { title: 'B' },
    );

    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(mockCacheManager.set).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default template when the file is missing', async () => {
    existsSyncMock.mockReturnValue(false);

    const result = await service.resolveTemplate(
      NotificationTypeEnum.USER_ONBOARDING_WELCOME,
      NotificationChannelTypeEnum.EMAIL,
      { title: 'Hi', body: 'Body text' },
    );

    expect(readFileMock).not.toHaveBeenCalled();
    expect(result.content).toContain('Hi');
    expect(result.content).toContain('Body text');
  });

  it('uses a default template id for unmapped type/channel pairs', async () => {
    existsSyncMock.mockReturnValue(false);

    const result = await service.resolveTemplate(
      NotificationTypeEnum.STREAK_MILESTONE,
      NotificationChannelTypeEnum.SMS,
      { title: 'Streak!' },
    );

    expect(result.templateId).toBe('default_sms');
  });

  it('sanitizes string metadata before substitution', async () => {
    readFileMock.mockResolvedValueOnce('<div>${body}</div>');

    const result = await service.resolveTemplate(
      NotificationTypeEnum.USER_ONBOARDING_WELCOME,
      NotificationChannelTypeEnum.EMAIL,
      { title: 'T', body: 'Safe<script>alert(1)</script>Text' },
    );

    expect(result.content).toBe('<div>SafeText</div>');
    expect(result.content).not.toContain('<script>');
  });

  it('falls back to the default template when reading throws', async () => {
    existsSyncMock.mockReturnValue(true);
    readFileMock.mockRejectedValueOnce(new Error('EACCES'));

    const result = await service.resolveTemplate(
      NotificationTypeEnum.USER_ONBOARDING_WELCOME,
      NotificationChannelTypeEnum.EMAIL,
      { title: 'Hi', body: 'B' },
    );

    expect(result.content).toContain('Hi');
  });
});
