import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import {
    NotificationStatusEnum,
    NotificationChannelTypeEnum,
} from '../enums/notification.enum';
import { INotificationChannelAdapter } from '../interfaces/adapter.interface';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { DeadLetterQueueRepository } from '../repositories/dead-letter-queue.repository';

export interface NotificationJobData {
    notificationId: string;
    userId?: string;
    channel: NotificationChannelTypeEnum;
    recipient: string;
    title: string;
    body: string;
    htmlBody?: string;
    metadata: Record<string, any>;
    requestId: string;
    provider?: string;
    notificationType: string;
}

export interface DispatchNotificationRequest {
    notificationId: string;
    userId?: string;
    channel: NotificationChannelTypeEnum;
    recipient: string;
    title: string;
    body: string;
    htmlBody?: string;
    metadata: Record<string, any>;
    requestId: string;
    provider?: string;
    notificationType: string;
}

@Processor('notification_dispatch')
@Injectable()
export class NotificationQueueService {
    private readonly logger = new Logger(NotificationQueueService.name);

    constructor(
        @InjectQueue('notification_dispatch') private queue: Queue,
        @Inject('NOTIFICATION_CHANNEL_ADAPTERS')
        private adapters: Map<
            NotificationChannelTypeEnum,
            INotificationChannelAdapter[]
        >,
        private auditLogRepository: AuditLogRepository,
        private deadLetterQueueRepository: DeadLetterQueueRepository,
    ) { }

    /**
     * Dispatch a notification to the queue (Producer)
     */
    async dispatch(request: DispatchNotificationRequest) {
        const jobData: NotificationJobData = {
            notificationId: request.notificationId,
            userId: request.userId,
            channel: request.channel,
            recipient: request.recipient,
            title: request.title,
            body: request.body,
            htmlBody: request.htmlBody,
            metadata: request.metadata,
            requestId: request.requestId,
            provider: request.provider,
            notificationType: request.notificationType,
        };

        await this.queue.add('send_notification', jobData);

        return {
            channel: {
                type: request.channel as NotificationChannelTypeEnum,
                provider: request.provider,
            },
            status: NotificationStatusEnum.QUEUED,
        };
    }

    /**
     * Process a notification job from the queue (Consumer)
     */
    @Process({ name: 'send_notification', concurrency: 10 })
    async processNotification(job: Job<NotificationJobData>) {
        const data = job.data;

        // Get adapters for the channel
        const channelAdapters = this.adapters.get(
            data.channel as NotificationChannelTypeEnum,
        );
        if (!channelAdapters || channelAdapters.length === 0) {
            throw new Error(`No adapters available for channel: ${data.channel}`);
        }

        // Select adapter (by provider name or use first available)
        const adapter = data.provider
            ? channelAdapters.find((a) => a.name === data.provider)
            : channelAdapters[0];

        if (!adapter) {
            throw new Error(`Adapter not found: ${data.provider}`);
        }

        // Create audit log
        const auditLog = await this.auditLogRepository.create({
            requestId: data.requestId,
            type: data.userId ? 'USER' : 'EXTERNAL',
            notificationType: data.notificationType,
            recipientId: data.userId, // Actual user ID (undefined for external)
            recipientContact: data.recipient, // Email, phone, or push token
            channel: data.channel as NotificationChannelTypeEnum,
            provider: adapter.name,
            status: NotificationStatusEnum.QUEUED,
            metadata: data.metadata,
        });

        try {
            // Send notification
            const result = await adapter.send({
                recipient: data.recipient,
                title: data.title,
                body: data.body,
                htmlBody: data.htmlBody,
                metadata: data.metadata,
                requestId: data.requestId,
            });

            // Update audit log
            await this.auditLogRepository.update(auditLog.id, {
                status: result.status,
                sentAt: new Date(),
                error: result.error,
            });

            if (result.status === NotificationStatusEnum.FAILED) {
                throw new Error(result.error || 'Notification sending failed');
            }

            return result;
        } catch (error) {
            // Update audit log on failure
            await this.auditLogRepository.update(auditLog.id, {
                status: NotificationStatusEnum.FAILED,
                error: error.message || 'Unknown error',
            });

            throw error; // Let Bull handle retry
        }
    }

    /**
     * Handle failed jobs after all retries are exhausted
     */
    @OnQueueFailed()
    async handleFailure(job: Job<NotificationJobData>, error: Error) {
        const maxAttempts = job.opts.attempts || 3;

        this.logger.error(
            `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
            error.stack,
        );

        // If job has exhausted all retries, move to dead letter queue
        if (job.attemptsMade >= maxAttempts) {
            this.logger.error(
                `Notification job ${job.id} failed permanently. RequestId: ${job.data.requestId}. Moving to DLQ.`,
            );

            try {
                await this.deadLetterQueueRepository.create({
                    requestId: job.data.requestId,
                    notificationId: job.data.notificationId,
                    userId: job.data.userId,
                    channel: job.data.channel as NotificationChannelTypeEnum,
                    recipient: job.data.recipient,
                    notificationType: job.data.notificationType,
                    attempts: job.attemptsMade,
                    lastError: error.message || 'Unknown error',
                    jobData: job.data,
                });

                this.logger.log(
                    `Successfully moved job ${job.id} to dead letter queue`,
                );
            } catch (dlqError) {
                this.logger.error(
                    `Failed to save job ${job.id} to dead letter queue: ${dlqError.message}`,
                    dlqError.stack,
                );
            }
        }
    }
}

