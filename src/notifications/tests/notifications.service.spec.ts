jest.mock('isomorphic-dompurify', () => ({
  sanitize: (value: string) => value,
}));

jest.mock('src/common', () => ({
  BaseService: class BaseService {
    Results(data: unknown) {
      return { isError: false, data };
    }
    HandleError(error: unknown) {
      return { isError: true, error };
    }
  },
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications.service';
import {
  NotificationChannelTypeEnum,
  NotificationStatusEnum,
  NotificationTypeEnum,
} from '../enums/notification.enum';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrisma: any;
  let mockDispatcher: any;
  let mockTemplateService: any;

  const mockUser = {
    id: 'user-1',
    firebaseId: 'fb-1',
    email: 'user@test.dev',
    pushTokens: ['ExpoToken[abc]'],
  };

  beforeEach(() => {
    mockDispatcher = {
      dispatch: jest.fn().mockImplementation((req) => ({
        channel: { type: req.channel, provider: req.provider },
        status: NotificationStatusEnum.QUEUED,
      })),
    };

    mockTemplateService = {
      resolveTemplate: jest.fn().mockResolvedValue({
        templateId: 'email_user_onboarding_welcome',
        subject: 'Welcome',
        content: 'Hello there',
        htmlBody: '<p>Hello there</p>',
        variables: ['title'],
      }),
    };

    mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...mockUser }),
        update: jest.fn(),
      },
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      },
      notificationRecipient: {
        create: jest.fn().mockResolvedValue({ id: 'rec-1' }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      notificationAuditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Pass the same mock object in as the transaction client
      $transaction: jest.fn((fn: (tx: any) => Promise<unknown>) =>
        fn(mockPrisma),
      ),
    };

    service = new NotificationsService(
      mockPrisma,
      mockDispatcher,
      mockTemplateService,
    );
  });

  describe('registerPushToken', () => {
    it('adds a new push token atomically', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        pushTokens: [],
      });
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        pushTokens: ['ExpoToken[new]'],
      });

      const result: any = await service.registerPushToken('fb-1', {
        pushToken: 'ExpoToken[new]',
      });

      expect(result.isError).toBe(false);
      expect(result.data.tokensCount).toBe(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { firebaseId: 'fb-1' },
        data: { pushTokens: { push: 'ExpoToken[new]' } },
      });
    });

    it('does not re-add a duplicate token', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        pushTokens: ['ExpoToken[abc]'],
      });

      const result: any = await service.registerPushToken('fb-1', {
        pushToken: 'ExpoToken[abc]',
      });

      expect(result.isError).toBe(false);
      expect(result.data.tokensCount).toBe(1);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.registerPushToken('missing', { pushToken: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removePushToken', () => {
    it('removes the token and reports the new count', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        pushTokens: ['a', 'b'],
      });
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        pushTokens: ['b'],
      });

      const result: any = await service.removePushToken('fb-1', {
        pushToken: 'a',
      });

      expect(result.data.tokensCount).toBe(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { firebaseId: 'fb-1' },
        data: { pushTokens: ['b'] },
      });
    });

    it('rejects when the user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.removePushToken('missing', { pushToken: 'a' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getUserTokens', () => {
    it('returns the tokens and count', async () => {
      const result: any = await service.getUserTokens('fb-1');

      expect(result.isError).toBe(false);
      expect(result.data).toEqual({
        tokens: ['ExpoToken[abc]'],
        count: 1,
      });
    });

    it('returns an error when the user is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const result: any = await service.getUserTokens('missing');

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('notifyUser', () => {
    it('marks IN_APP channel as SENT and creates the records', async () => {
      const results = await service.notifyUser({
        userId: 'user-1',
        type: NotificationTypeEnum.MANUAL,
        requestId: 'req-1',
        channels: [{ type: NotificationChannelTypeEnum.IN_APP }],
        metadata: { title: 'Hi', body: 'There' },
      });

      expect(results).toEqual([
        {
          channel: { type: NotificationChannelTypeEnum.IN_APP },
          status: NotificationStatusEnum.SENT,
        },
      ]);
      expect(mockPrisma.notification.create).toHaveBeenCalled();
      expect(mockPrisma.notificationRecipient.create).toHaveBeenCalled();
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('dispatches external channels through the queue', async () => {
      const results = await service.notifyUser({
        userId: 'user-1',
        type: NotificationTypeEnum.USER_ONBOARDING_WELCOME,
        requestId: 'req-2',
        channels: [{ type: NotificationChannelTypeEnum.EMAIL }],
        metadata: { title: 'Welcome' },
      });

      expect(mockTemplateService.resolveTemplate).toHaveBeenCalled();
      expect(mockDispatcher.dispatch).toHaveBeenCalledTimes(1);
      expect(results[0].status).toBe(NotificationStatusEnum.QUEUED);
    });

    it('fails a channel when no contact info is available', async () => {
      // getRecipientContact resolves the user with no email
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        email: null,
        pushTokens: [],
      });

      const results = await service.notifyUser({
        userId: 'user-1',
        type: NotificationTypeEnum.USER_ONBOARDING_WELCOME,
        requestId: 'req-3',
        channels: [{ type: NotificationChannelTypeEnum.EMAIL }],
        metadata: { title: 'Welcome' },
      });

      expect(results[0].status).toBe(NotificationStatusEnum.FAILED);
      expect(results[0].error).toContain('No contact info');
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('is idempotent and rebuilds results from audit logs', async () => {
      mockPrisma.notification.findUnique.mockResolvedValueOnce({
        id: 'notif-1',
        channels: ['EMAIL'],
      });
      mockPrisma.notificationAuditLog.findMany.mockResolvedValueOnce([
        {
          channel: 'EMAIL',
          provider: 'Mailjet',
          status: 'SENT',
          error: null,
        },
      ]);

      const results = await service.notifyUser({
        userId: 'user-1',
        type: NotificationTypeEnum.USER_ONBOARDING_WELCOME,
        requestId: 'dup-req',
        metadata: { title: 'Welcome' },
      });

      expect(results).toEqual([
        {
          channel: {
            type: NotificationChannelTypeEnum.EMAIL,
            provider: 'Mailjet',
          },
          status: NotificationStatusEnum.SENT,
          error: undefined,
        },
      ]);
      // No new records created for a duplicate request
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('falls back to the notification record when no audit logs exist', async () => {
      mockPrisma.notification.findUnique.mockResolvedValueOnce({
        id: 'notif-1',
        channels: ['IN_APP'],
      });
      mockPrisma.notificationAuditLog.findMany.mockResolvedValueOnce([]);

      const results = await service.notifyUser({
        userId: 'user-1',
        type: NotificationTypeEnum.MANUAL,
        requestId: 'dup-req-2',
        metadata: { title: 'Welcome' },
      });

      expect(results).toEqual([
        {
          channel: { type: NotificationChannelTypeEnum.IN_APP },
          status: NotificationStatusEnum.SENT,
        },
      ]);
    });
  });

  describe('notifyBulkUsers', () => {
    it('rejects an empty user list', async () => {
      await expect(
        service.notifyBulkUsers({
          userIds: [],
          type: NotificationTypeEnum.STREAK_REMINDER,
          requestId: 'bulk-1',
          metadata: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects more than 1000 recipients', async () => {
      await expect(
        service.notifyBulkUsers({
          userIds: Array.from({ length: 1001 }, (_, i) => `u${i}`),
          type: NotificationTypeEnum.STREAK_REMINDER,
          requestId: 'bulk-2',
          metadata: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('counts successful users across channels', async () => {
      const result = await service.notifyBulkUsers({
        userIds: ['u1', 'u2'],
        type: NotificationTypeEnum.USER_ONBOARDING_WELCOME,
        requestId: 'bulk-3',
        channels: [
          { type: NotificationChannelTypeEnum.IN_APP },
          { type: NotificationChannelTypeEnum.EMAIL },
        ],
        metadata: { title: 'Hi' },
      });

      expect(result.success).toBe(true);
      expect(result.totalUsers).toBe(2);
      expect(result.successfulUsers).toBe(2);
      expect(result.failedUsers).toBe(0);
      expect(result.failures).toBeUndefined();
    });

    it('records failures when contact info is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        email: null,
        pushTokens: [],
      });

      const result = await service.notifyBulkUsers({
        userIds: ['u1'],
        type: NotificationTypeEnum.USER_ONBOARDING_WELCOME,
        requestId: 'bulk-4',
        channels: [{ type: NotificationChannelTypeEnum.EMAIL }],
        metadata: { title: 'Hi' },
      });

      expect(result.successfulUsers).toBe(0);
      expect(result.failedUsers).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures?.[0].reason).toContain('No EMAIL contact');
    });
  });

  describe('notifyExternalUser', () => {
    it('dispatches an email to an external recipient', async () => {
      const results = await service.notifyExternalUser({
        email: 'external@test.dev',
        type: NotificationTypeEnum.PASSWORD_RESET_OTP,
        requestId: 'ext-1',
        metadata: { title: 'Reset', otp: '123456' },
      });

      expect(mockDispatcher.dispatch).toHaveBeenCalledTimes(1);
      expect(results[0].status).toBe(NotificationStatusEnum.QUEUED);
    });

    it('fails when no recipient is provided for the channel', async () => {
      const results = await service.notifyExternalUser({
        type: NotificationTypeEnum.PASSWORD_RESET_OTP,
        requestId: 'ext-2',
        channels: [{ type: NotificationChannelTypeEnum.EMAIL }],
        metadata: { title: 'Reset' },
      });

      expect(results[0].status).toBe(NotificationStatusEnum.FAILED);
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('is idempotent using audit logs', async () => {
      mockPrisma.notificationAuditLog.findMany.mockResolvedValueOnce([
        { channel: 'EMAIL', provider: 'Mailjet', status: 'SENT', error: null },
      ]);

      const results = await service.notifyExternalUser({
        email: 'external@test.dev',
        type: NotificationTypeEnum.PASSWORD_RESET_OTP,
        requestId: 'ext-dup',
        metadata: { title: 'Reset' },
      });

      expect(results[0].status).toBe(NotificationStatusEnum.SENT);
      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('createManualNotification', () => {
    it('resolves the user and delegates to notifyUser', async () => {
      const result: any = await service.createManualNotification({
        recipientFirebaseId: 'fb-1',
        title: 'Manual',
        body: 'Message',
      });

      expect(result.isError).toBe(false);
      expect(result.data.results[0].status).toBe(NotificationStatusEnum.SENT);
    });

    it('returns an error when the recipient does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const result: any = await service.createManualNotification({
        recipientFirebaseId: 'nope',
        title: 'Manual',
        body: 'Message',
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('getUserNotifications', () => {
    it('returns paginated notifications', async () => {
      mockPrisma.notificationRecipient.findMany.mockResolvedValueOnce([
        { id: 'rec-1', notification: { id: 'notif-1' } },
      ]);
      mockPrisma.notificationRecipient.count.mockResolvedValueOnce(1);

      const result: any = await service.getUserNotifications('fb-1', 1, 10);

      expect(result.isError).toBe(false);
      expect(result.data.data).toHaveLength(1);
      expect(result.data.pagination.total).toBe(1);
      expect(result.data.pagination.totalPages).toBe(1);
    });

    it('applies the unreadOnly filter', async () => {
      await service.getUserNotifications('fb-1', 1, 10, true);

      expect(mockPrisma.notificationRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recipientId: 'user-1', isRead: false },
        }),
      );
    });

    it('returns an error when the user is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const result: any = await service.getUserNotifications('missing');

      expect(result.isError).toBe(true);
    });
  });

  describe('markNotificationAsRead', () => {
    it('marks the notification as read', async () => {
      mockPrisma.notificationRecipient.findFirst.mockResolvedValueOnce({
        id: 'rec-1',
      });

      const result: any = await service.markNotificationAsRead(
        'fb-1',
        'notif-1',
      );

      expect(result.isError).toBe(false);
      expect(mockPrisma.notificationRecipient.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { isRead: true },
      });
    });

    it('returns an error when the notification is not found', async () => {
      mockPrisma.notificationRecipient.findFirst.mockResolvedValueOnce(null);

      const result: any = await service.markNotificationAsRead(
        'fb-1',
        'notif-x',
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('updates all recipient records for the user', async () => {
      const result: any = await service.markAllNotificationsAsRead('fb-1');

      expect(result.isError).toBe(false);
      expect(mockPrisma.notificationRecipient.updateMany).toHaveBeenCalledWith({
        where: { recipientId: 'user-1' },
        data: { isRead: true },
      });
    });
  });

  describe('countUnreadNotifications', () => {
    it('returns the unread count', async () => {
      mockPrisma.notificationRecipient.count.mockResolvedValueOnce(4);

      const result: any = await service.countUnreadNotifications('fb-1');

      expect(result.data.count).toBe(4);
      expect(mockPrisma.notificationRecipient.count).toHaveBeenCalledWith({
        where: { recipientId: 'user-1', isRead: false },
      });
    });
  });
});
