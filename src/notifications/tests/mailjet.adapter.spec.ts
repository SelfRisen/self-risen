jest.mock('node-mailjet', () => {
  const requestMock = jest.fn();
  const postMock = jest.fn(() => ({ request: requestMock }));
  const MockMailjet: any = jest.fn().mockImplementation(() => ({
    post: postMock,
  }));
  MockMailjet.__request = requestMock;
  MockMailjet.__post = postMock;
  return { __esModule: true, default: MockMailjet };
});

import Mailjet from 'node-mailjet';
import { MailjetAdapter } from '../adapters/email/mailjet.adapter';
import { NotificationStatusEnum } from '../enums/notification.enum';

const MailjetMock = Mailjet as any;

function makeConfig(store: Record<string, string | undefined>) {
  return { get: jest.fn((key: string) => store[key]) } as any;
}

const request = {
  recipient: 'to@test.dev',
  title: 'Subject',
  body: 'Plain body',
  htmlBody: '<p>HTML body</p>',
  metadata: {},
  requestId: 'req-1',
};

describe('MailjetAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fails when the from-email is not configured', async () => {
    const adapter = new MailjetAdapter(
      makeConfig({
        MAILJET_API_KEY: 'key',
        MAILJET_SECRET_KEY: 'secret',
        // no MAILJET_FROM_EMAIL
      }),
    );

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.FAILED);
    expect(result.error).toContain('MAILJET_FROM_EMAIL');
  });

  it('fails when the client was never initialized (missing credentials)', async () => {
    const adapter = new MailjetAdapter(
      makeConfig({
        MAILJET_FROM_EMAIL: 'from@test.dev',
        // no API key/secret => this.mailjet stays undefined
      }),
    );

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.FAILED);
    expect(result.error).toContain('not initialized');
  });

  it('sends the email and returns SENT with the message id', async () => {
    MailjetMock.__request.mockResolvedValueOnce({
      body: { Messages: [{ To: [{ MessageID: 987 }] }] },
    });

    const adapter = new MailjetAdapter(
      makeConfig({
        MAILJET_API_KEY: 'key',
        MAILJET_SECRET_KEY: 'secret',
        MAILJET_FROM_EMAIL: 'from@test.dev',
        MAILJET_FROM_NAME: 'Self-Risen',
      }),
    );

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.SENT);
    expect(result.messageId).toBe('987');
    expect(MailjetMock.__request).toHaveBeenCalledWith(
      expect.objectContaining({
        Messages: [
          expect.objectContaining({
            To: [{ Email: 'to@test.dev' }],
            Subject: 'Subject',
            HTMLPart: '<p>HTML body</p>',
          }),
        ],
      }),
    );
  });

  it('returns FAILED when the Mailjet request throws', async () => {
    MailjetMock.__request.mockRejectedValueOnce(new Error('mailjet down'));

    const adapter = new MailjetAdapter(
      makeConfig({
        MAILJET_API_KEY: 'key',
        MAILJET_SECRET_KEY: 'secret',
        MAILJET_FROM_EMAIL: 'from@test.dev',
      }),
    );

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.FAILED);
    expect(result.error).toBe('mailjet down');
  });

  it('healthCheck is true only when fully configured', async () => {
    const healthy = new MailjetAdapter(
      makeConfig({
        MAILJET_API_KEY: 'key',
        MAILJET_SECRET_KEY: 'secret',
        MAILJET_FROM_EMAIL: 'from@test.dev',
      }),
    );
    const unhealthy = new MailjetAdapter(
      makeConfig({ MAILJET_FROM_EMAIL: 'from@test.dev' }),
    );

    await expect(healthy.healthCheck()).resolves.toBe(true);
    await expect(unhealthy.healthCheck()).resolves.toBe(false);
  });
});
