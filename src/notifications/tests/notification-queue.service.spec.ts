import { NotificationQueueService } from '../services/notification-queue.service';
import {
  NotificationChannelTypeEnum,
  NotificationStatusEnum,
} from '../enums/notification.enum';

describe('NotificationQueueService', () => {
  let service: NotificationQueueService;
  let mockQueue: any;
  let mockAdapter: any;
  let adapters: Map<NotificationChannelTypeEnum, any[]>;
  let mockAuditRepo: any;
  let mockDlqRepo: any;

  const baseJobData = {
    notificationId: 'notif-1',
    userId: 'user-1',
    channel: NotificationChannelTypeEnum.EMAIL,
    recipient: 'user@test.dev',
    title: 'Subject',
    body: 'Body',
    htmlBody: '<p>Body</p>',
    metadata: {},
    requestId: 'req-1',
    provider: 'Mailjet',
    notificationType: 'USER_ONBOARDING_WELCOME',
  };

  beforeEach(() => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    mockAdapter = {
      name: 'Mailjet',
      channel: NotificationChannelTypeEnum.EMAIL,
      send: jest.fn().mockResolvedValue({
        status: NotificationStatusEnum.SENT,
        messageId: 'm1',
      }),
      healthCheck: jest.fn().mockResolvedValue(true),
    };

    adapters = new Map();
    adapters.set(NotificationChannelTypeEnum.EMAIL, [mockAdapter]);

    mockAuditRepo = {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      update: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    mockDlqRepo = {
      create: jest.fn().mockResolvedValue({ id: 'dlq-1' }),
    };

    service = new NotificationQueueService(
      mockQueue,
      adapters,
      mockAuditRepo,
      mockDlqRepo,
    );
  });

  describe('dispatch', () => {
    it('adds a job to the queue and returns a QUEUED result', async () => {
      const result = await service.dispatch(baseJobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send_notification',
        expect.objectContaining({ requestId: 'req-1', channel: 'EMAIL' }),
      );
      expect(result).toEqual({
        channel: {
          type: NotificationChannelTypeEnum.EMAIL,
          provider: 'Mailjet',
        },
        status: NotificationStatusEnum.QUEUED,
      });
    });
  });

  describe('processNotification', () => {
    it('sends via the matching adapter and marks the audit log sent', async () => {
      const result = await service.processNotification({
        data: baseJobData,
      } as any);

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'USER', provider: 'Mailjet' }),
      );
      expect(mockAdapter.send).toHaveBeenCalled();
      expect(mockAuditRepo.update).toHaveBeenCalledWith(
        'audit-1',
        expect.objectContaining({ status: NotificationStatusEnum.SENT }),
      );
      expect(result.status).toBe(NotificationStatusEnum.SENT);
    });

    it('records EXTERNAL type when no userId is present', async () => {
      await service.processNotification({
        data: { ...baseJobData, userId: undefined },
      } as any);

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'EXTERNAL' }),
      );
    });

    it('throws when no adapters exist for the channel', async () => {
      await expect(
        service.processNotification({
          data: { ...baseJobData, channel: NotificationChannelTypeEnum.SMS },
        } as any),
      ).rejects.toThrow('No adapters available for channel: SMS');
    });

    it('throws when the requested provider is not found', async () => {
      await expect(
        service.processNotification({
          data: { ...baseJobData, provider: 'Nonexistent' },
        } as any),
      ).rejects.toThrow('Adapter not found: Nonexistent');
    });

    it('uses the first adapter when no provider is specified', async () => {
      await service.processNotification({
        data: { ...baseJobData, provider: undefined },
      } as any);

      expect(mockAdapter.send).toHaveBeenCalled();
    });

    it('marks the audit log failed and rethrows when the adapter reports FAILED', async () => {
      mockAdapter.send.mockResolvedValueOnce({
        status: NotificationStatusEnum.FAILED,
        error: 'provider down',
      });

      await expect(
        service.processNotification({ data: baseJobData } as any),
      ).rejects.toThrow('provider down');

      expect(mockAuditRepo.update).toHaveBeenLastCalledWith(
        'audit-1',
        expect.objectContaining({ status: NotificationStatusEnum.FAILED }),
      );
    });

    it('marks the audit log failed and rethrows when the adapter throws', async () => {
      mockAdapter.send.mockRejectedValueOnce(new Error('network boom'));

      await expect(
        service.processNotification({ data: baseJobData } as any),
      ).rejects.toThrow('network boom');

      expect(mockAuditRepo.update).toHaveBeenCalledWith(
        'audit-1',
        expect.objectContaining({
          status: NotificationStatusEnum.FAILED,
          error: 'network boom',
        }),
      );
    });
  });

  describe('handleFailure', () => {
    it('moves the job to the dead letter queue once retries are exhausted', async () => {
      const job = {
        id: 'job-9',
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: baseJobData,
      };

      await service.handleFailure(job as any, new Error('permanent failure'));

      expect(mockDlqRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-1',
          attempts: 3,
          lastError: 'permanent failure',
        }),
      );
    });

    it('does not touch the DLQ while retries remain', async () => {
      const job = {
        id: 'job-9',
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: baseJobData,
      };

      await service.handleFailure(job as any, new Error('transient'));

      expect(mockDlqRepo.create).not.toHaveBeenCalled();
    });

    it('swallows errors raised while writing to the DLQ', async () => {
      mockDlqRepo.create.mockRejectedValueOnce(new Error('db down'));
      const job = {
        id: 'job-9',
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: baseJobData,
      };

      await expect(
        service.handleFailure(job as any, new Error('permanent failure')),
      ).resolves.toBeUndefined();
    });
  });
});
