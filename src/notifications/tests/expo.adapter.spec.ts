jest.mock('expo-server-sdk', () => {
  const sendMock = jest.fn();
  const chunkMock = jest.fn((messages: unknown[]) => [messages]);
  const MockExpo: any = jest.fn().mockImplementation(() => ({
    chunkPushNotifications: chunkMock,
    sendPushNotificationsAsync: sendMock,
  }));
  MockExpo.isExpoPushToken = jest.fn().mockReturnValue(true);
  MockExpo.__send = sendMock;
  MockExpo.__chunk = chunkMock;
  return { Expo: MockExpo };
});

import { Expo } from 'expo-server-sdk';
import { ExpoAdapter } from '../adapters/push/expo.adapter';
import { NotificationStatusEnum } from '../enums/notification.enum';

const ExpoMock = Expo as any;

describe('ExpoAdapter', () => {
  let adapter: ExpoAdapter;

  const request = {
    recipient: 'ExpoPushToken[valid]',
    title: 'Hi',
    body: 'There',
    metadata: { foo: 'bar' },
    requestId: 'req-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ExpoMock.isExpoPushToken.mockReturnValue(true);
    const configService = { get: jest.fn().mockReturnValue('token') };
    adapter = new ExpoAdapter(configService as any);
  });

  it('rejects an invalid Expo push token', async () => {
    ExpoMock.isExpoPushToken.mockReturnValue(false);

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.FAILED);
    expect(result.error).toContain('Invalid Expo push token');
    expect(ExpoMock.__send).not.toHaveBeenCalled();
  });

  it('returns SENT with the ticket id on success', async () => {
    ExpoMock.__send.mockResolvedValueOnce([{ status: 'ok', id: 'ticket-1' }]);

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.SENT);
    expect(result.messageId).toBe('ticket-1');
  });

  it('returns FAILED when Expo reports an error ticket', async () => {
    ExpoMock.__send.mockResolvedValueOnce([
      { status: 'error', message: 'DeviceNotRegistered' },
    ]);

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.FAILED);
    expect(result.error).toBe('DeviceNotRegistered');
  });

  it('returns FAILED when no ticket is returned', async () => {
    ExpoMock.__send.mockResolvedValueOnce([]);

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.FAILED);
    expect(result.error).toContain('No ticket returned');
  });

  it('returns FAILED when the SDK throws', async () => {
    ExpoMock.__send.mockRejectedValueOnce(new Error('network'));

    const result = await adapter.send(request);

    expect(result.status).toBe(NotificationStatusEnum.FAILED);
    expect(result.error).toBe('network');
  });

  it('reports healthy', async () => {
    await expect(adapter.healthCheck()).resolves.toBe(true);
  });
});
