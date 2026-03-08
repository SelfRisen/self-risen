import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { StreakService } from "../services/streak.service";
import { DatabaseProvider } from "src/database/database.provider";
import { Observable } from "rxjs";
import { auth } from "firebase-admin";

@Injectable()
export class StreakInterceptor implements NestInterceptor {
    private readonly logger = new Logger(StreakInterceptor.name);
    constructor(
        private streakService: StreakService,
        private prisma: DatabaseProvider,
    ) { }

    async intercept(
        context: ExecutionContext,
        next: CallHandler
    ): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();

        const user: auth.DecodedIdToken | undefined = request.user;

        if (user) {
            try {
                await this.updateStreak(user.uid);
            } catch (err) {
                this.logger.error(`Failed to update streak: ${err.message}`);
            }
        }
        return next.handle();
    }

    private async updateStreak(firebaseId: string) {
        const user = await this.prisma.user.findUnique({
            where: { firebaseId }
        });
        if (!user) {
            return;
        }
        await this.streakService.updateStreak(user);
    }
}