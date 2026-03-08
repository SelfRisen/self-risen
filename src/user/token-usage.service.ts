import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { DatabaseProvider } from 'src/database/database.provider';
import { config, BaseService } from 'src/common';

@Injectable()
export class TokenUsageService extends BaseService {
    private readonly logger = new Logger(TokenUsageService.name);

    constructor(private prisma: DatabaseProvider) {
        super();
    }

    /**
     * Check if user has enough tokens remaining for the month.
     * Reset is performed only here when the period has rolled over.
     * Default limit: 30,000 tokens per month
     * @param userId - User's database ID
     * @param estimatedTokens - Estimated tokens needed for the operation
     * @throws ForbiddenException if user has exceeded their monthly limit
     */
    async checkTokenLimit(userId: string, estimatedTokens: number = 1000): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: {
                    tokensUsedThisMonth: true,
                    tokenLimitPerMonth: true,
                    tokenResetDate: true,
                },
            });

            if (!user) {
                throw new Error('User not found');
            }

            const now = new Date();
            const resetDate = new Date(user.tokenResetDate);
            let effectiveUsed = user.tokensUsedThisMonth;

            if (now >= resetDate) {
                const nextResetDate = new Date(now);
                nextResetDate.setMonth(nextResetDate.getMonth() + 1);
                nextResetDate.setDate(1);
                nextResetDate.setHours(0, 0, 0, 0);

                await tx.user.update({
                    where: { id: userId },
                    data: {
                        tokensUsedThisMonth: 0,
                        tokenResetDate: nextResetDate,
                    },
                });
                effectiveUsed = 0;

                if (config.NODE_ENV === 'development') {
                    this.logger.log(`Reset token counter for user ${userId}. Next reset: ${nextResetDate.toISOString()}`);
                }
                return;
            }

            const projectedUsage = effectiveUsed + estimatedTokens;
            if (projectedUsage > user.tokenLimitPerMonth) {
                const remainingTokens = Math.max(0, user.tokenLimitPerMonth - effectiveUsed);
                const daysUntilReset = Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                if (config.NODE_ENV === 'development') {
                    this.logger.warn(
                        `User ${userId} exceeded token limit. Used: ${effectiveUsed}, Limit: ${user.tokenLimitPerMonth}, Estimated: ${estimatedTokens}`
                    );
                }

                throw new ForbiddenException(
                    `Monthly token limit exceeded. You have ${remainingTokens} tokens remaining out of ${user.tokenLimitPerMonth}. ` +
                        `This operation requires approximately ${estimatedTokens} tokens. ` +
                        `Your limit will reset in ${daysUntilReset} day(s).`
                );
            }
        });
    }

    /**
     * Track token usage after an API call
     * @param userId - User's database ID
     * @param tokensUsed - Actual tokens used in the API call
     */
    async trackTokenUsage(userId: string, tokensUsed: number): Promise<void> {
        try {
            await this.prisma.$transaction(async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: userId },
                    select: { id: true },
                });

                if (!user) {
                    throw new Error('User not found');
                }

                await tx.user.update({
                    where: { id: userId },
                    data: {
                        tokensUsedThisMonth: {
                            increment: tokensUsed,
                        },
                    },
                });
            });

            if (config.NODE_ENV === 'development') {
                this.logger.log(`Tracked ${tokensUsed} tokens for user ${userId}`);
            }
        } catch (error) {
            this.logger.error(`Error tracking token usage: ${error.message}`, error.stack);
            // Don't throw - we don't want token tracking failures to break the main flow
        }
    }

    /**
     * Get token usage stats for a user
     * @param userId - User's database ID
     */
    async getTokenUsage(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                tokensUsedThisMonth: true,
                tokenLimitPerMonth: true,
                tokenResetDate: true,
            },
        });

        if (!user) {
            throw new Error('User not found');
        }

        const now = new Date();
        const resetDate = new Date(user.tokenResetDate);
        const daysUntilReset = Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const tokensRemaining = Math.max(0, user.tokenLimitPerMonth - user.tokensUsedThisMonth);
        const usagePercentage = (user.tokensUsedThisMonth / user.tokenLimitPerMonth) * 100;

        return {
            tokensUsedThisMonth: user.tokensUsedThisMonth,
            tokenLimitPerMonth: user.tokenLimitPerMonth,
            tokensRemaining,
            usagePercentage: Math.round(usagePercentage * 100) / 100,
            resetDate: user.tokenResetDate,
            daysUntilReset: Math.max(0, daysUntilReset),
        };
    }

    /**
     * Update user's monthly token limit (admin function)
     * @param userId - User's database ID
     * @param newLimit - New monthly token limit
     */
    async updateTokenLimit(userId: string, newLimit: number): Promise<void> {
        if (newLimit < 0) {
            throw new Error('Token limit must be positive');
        }

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                tokenLimitPerMonth: newLimit,
            },
        });

        if (config.NODE_ENV === 'development') {
            this.logger.log(`Updated token limit for user ${userId} to ${newLimit}`);
        }
    }
}
