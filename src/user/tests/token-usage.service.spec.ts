jest.mock('src/common', () => {
  const actual = jest.requireActual('src/common');
  return { ...actual, config: { ...actual.config, NODE_ENV: 'test' } };
});

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { TokenUsageService } from '../token-usage.service';
import { DatabaseProvider } from '../../database/database.provider';

describe('TokenUsageService', () => {
  let service: TokenUsageService;
  let mockPrisma: any;
  let tx: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    tx = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenUsageService,
        { provide: DatabaseProvider, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TokenUsageService>(TokenUsageService);
  });

  describe('checkTokenLimit', () => {
    it('throws when the user is not found', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(service.checkTokenLimit('user-1')).rejects.toThrow(
        'User not found',
      );
    });

    it('resets the counter once the reset date has passed', async () => {
      tx.user.findUnique.mockResolvedValue({
        tokensUsedThisMonth: 5000,
        tokenLimitPerMonth: 300000,
        tokenResetDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      await service.checkTokenLimit('user-1', 1000);

      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ tokensUsedThisMonth: 0 }),
        }),
      );
    });

    it('throws Forbidden when projected usage exceeds the limit', async () => {
      tx.user.findUnique.mockResolvedValue({
        tokensUsedThisMonth: 29500,
        tokenLimitPerMonth: 300000,
        tokenResetDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      await expect(
        service.checkTokenLimit('user-1', 1000),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('passes when there is enough budget', async () => {
      tx.user.findUnique.mockResolvedValue({
        tokensUsedThisMonth: 1000,
        tokenLimitPerMonth: 300000,
        tokenResetDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      await expect(
        service.checkTokenLimit('user-1', 1000),
      ).resolves.toBeUndefined();
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });

  describe('trackTokenUsage', () => {
    it('increments the monthly counter', async () => {
      tx.user.findUnique.mockResolvedValue({ id: 'user-1' });

      await service.trackTokenUsage('user-1', 250);

      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { tokensUsedThisMonth: { increment: 250 } },
        }),
      );
    });

    it('swallows errors so it never breaks the main flow', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('db down'));

      await expect(
        service.trackTokenUsage('user-1', 250),
      ).resolves.toBeUndefined();
    });
  });

  describe('getTokenUsage', () => {
    it('throws when the user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getTokenUsage('user-1')).rejects.toThrow(
        'User not found',
      );
    });

    it('returns computed usage stats', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        tokensUsedThisMonth: 7500,
        tokenLimitPerMonth: 300000,
        tokenResetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      });

      const result = await service.getTokenUsage('user-1');

      expect(result).toEqual(
        expect.objectContaining({
          tokensUsedThisMonth: 7500,
          tokenLimitPerMonth: 300000,
          tokensRemaining: 22500,
          usagePercentage: 25,
        }),
      );
      expect(result.daysUntilReset).toBeGreaterThanOrEqual(9);
    });

    it('reports 0% usage instead of NaN when the token limit is 0', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        tokensUsedThisMonth: 100,
        tokenLimitPerMonth: 0,
        tokenResetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      });

      const result = await service.getTokenUsage('user-1');

      expect(result.usagePercentage).toBe(0);
    });
  });

  describe('updateTokenLimit', () => {
    it('rejects a negative limit', async () => {
      await expect(service.updateTokenLimit('user-1', -1)).rejects.toThrow(
        'Token limit must be positive',
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('updates the limit', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await service.updateTokenLimit('user-1', 50000);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { tokenLimitPerMonth: 50000 },
        }),
      );
    });
  });
});
