import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseProvider } from 'src/database/database.provider';

const MONTHLY_LOOP_TOKEN_ALLOWANCE = 5;

@Injectable()
export class LoopTokenResetService {
    private readonly logger = new Logger(LoopTokenResetService.name);

    constructor(private readonly prisma: DatabaseProvider) {}

    @Cron('1 0 1 * *')
    async resetLoopTokens() {
        const result = await this.prisma.user.updateMany({
            data: {
                loopTokensRemaining: MONTHLY_LOOP_TOKEN_ALLOWANCE,
                loopTokensResetAt: new Date(),
            },
        });

        this.logger.log(`Reset loop tokens for ${result.count} users`);
    }
}
