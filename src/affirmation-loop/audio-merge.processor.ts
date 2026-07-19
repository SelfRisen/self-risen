import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AffirmationLoopStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DatabaseProvider } from 'src/database/database.provider';
import { StorageService } from 'src/common/storage/storage.service';
import { StaterVideosService } from 'src/stater-videos/stater-videos.service';
import { TextToSpeechService } from 'src/reflection/services/text-to-speech.service';
import { INotificationService } from 'src/notifications/interfaces/notification.interface';
import {
  NotificationChannelTypeEnum,
  NotificationTypeEnum,
} from 'src/notifications/enums/notification.enum';
import { AudioMergeService } from './audio-merge.service';
import { AudioMergeJobData } from './affirmation-loop.service';

@Processor('audio_merge')
@Injectable()
export class AudioMergeProcessor {
  private readonly logger = new Logger(AudioMergeProcessor.name);

  constructor(
    private readonly prisma: DatabaseProvider,
    private readonly storageService: StorageService,
    private readonly staterVideosService: StaterVideosService,
    private readonly textToSpeechService: TextToSpeechService,
    private readonly audioMergeService: AudioMergeService,
    private readonly notificationService: INotificationService,
  ) {}

  @Process({ name: 'merge_loop', concurrency: 1 })
  async handleMerge(job: Job<AudioMergeJobData>) {
    const { loopId } = job.data;
    let tmpDir: string | null = null;

    try {
      const loop = await this.prisma.affirmationLoop.findUnique({
        where: { id: loopId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { affirmation: true },
          },
          user: { select: { id: true, firebaseId: true } },
        },
      });

      if (!loop) {
        throw new Error(`Loop ${loopId} not found`);
      }

      await this.prisma.affirmationLoop.update({
        where: { id: loopId },
        data: { status: AffirmationLoopStatus.PROCESSING },
      });

      const targetVoice = loop.voicePreference;

      for (const item of loop.items) {
        const affirmation = item.affirmation;
        const needsTts =
          !affirmation.audioUrl ||
          (targetVoice != null &&
            affirmation.ttsVoicePreference !== targetVoice);

        if (!needsTts) continue;

        const voiceForTts =
          targetVoice ?? affirmation.ttsVoicePreference ?? undefined;

        const audioUrl =
          await this.textToSpeechService.generateAffirmationAudio(
            affirmation.affirmationText,
            loop.userId,
            voiceForTts ?? undefined,
          );

        if (!audioUrl) {
          throw new Error(
            `Failed to generate audio for affirmation ${affirmation.id}`,
          );
        }

        await this.prisma.affirmation.update({
          where: { id: affirmation.id },
          data: {
            audioUrl,
            ...(targetVoice != null && {
              ttsVoicePreference: targetVoice,
            }),
          },
        });

        affirmation.audioUrl = audioUrl;
      }

      for (const item of loop.items) {
        if (!item.affirmation.audioUrl) {
          throw new Error(
            `Affirmation ${item.affirmation.id} has no audio after TTS`,
          );
        }
      }

      const sound = this.staterVideosService.getSoundByName(
        loop.backgroundMusicKey,
      );
      if (!sound) {
        throw new Error(
          `Background music not found: ${loop.backgroundMusicKey}`,
        );
      }

      tmpDir = this.audioMergeService.createTempDir(loopId);

      const affirmationLocalPaths: string[] = [];
      for (let i = 0; i < loop.items.length; i++) {
        const dest = path.join(tmpDir, `affirmation-${i}.mp3`);
        await this.storageService.downloadToFile(
          loop.items[i].affirmation.audioUrl!,
          dest,
        );
        affirmationLocalPaths.push(dest);
      }

      const bgDest = path.join(tmpDir, 'background.mp3');
      await this.storageService.downloadToFile(sound.url, bgDest);

      const outputPath = path.join(tmpDir, 'output.mp3');
      const durationSeconds = await this.audioMergeService.mergeLoopAudio(
        affirmationLocalPaths,
        bgDest,
        outputPath,
        loop.durationSeconds ?? undefined,
      );

      const outputBuffer = await fs.readFile(outputPath);
      const storagePath = `loops/${loop.userId}/${loopId}.mp3`;

      const uploadResult = await this.storageService.uploadBufferAtPath(
        outputBuffer,
        storagePath,
        'audio/mpeg',
      );

      await this.prisma.affirmationLoop.update({
        where: { id: loopId },
        data: {
          status: AffirmationLoopStatus.READY,
          audioPath: uploadResult.path,
          durationSeconds,
          errorMessage: null,
        },
      });

      await this.notificationService.notifyUser({
        userId: loop.userId,
        type: NotificationTypeEnum.AFFIRMATION_LOOP_READY,
        requestId: `affirmation-loop-ready-${loopId}-${randomUUID()}`,
        channels: [
          { type: NotificationChannelTypeEnum.PUSH },
          { type: NotificationChannelTypeEnum.IN_APP },
        ],
        metadata: {
          title: 'Your affirmation loop is ready.',
          body: 'Your affirmation loop is ready.',
          loopId,
          screen: 'AffirmationLoop',
        },
      });

      this.logger.log(
        `Loop ${loopId} ready (${durationSeconds}s) at ${uploadResult.path}`,
      );
    } finally {
      if (tmpDir) {
        await this.audioMergeService.cleanupTempDir(tmpDir);
      }
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<AudioMergeJobData>, error: Error) {
    const { loopId } = job?.data ?? {};
    if (!loopId) return;

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    this.logger.error(
      `Audio merge failed for loop ${loopId}: ${error.message}`,
      error.stack,
    );

    try {
      const loop = await this.prisma.affirmationLoop.findUnique({
        where: { id: loopId },
        select: { userId: true, status: true },
      });

      if (!loop || loop.status === AffirmationLoopStatus.READY) {
        return;
      }

      await this.prisma.$transaction([
        this.prisma.affirmationLoop.update({
          where: { id: loopId },
          data: {
            status: AffirmationLoopStatus.FAILED,
            errorMessage: error.message?.slice(0, 500) ?? 'Unknown error',
          },
        }),
        this.prisma.user.update({
          where: { id: loop.userId },
          data: { loopTokensRemaining: { increment: 1 } },
        }),
      ]);

      try {
        await this.notificationService.notifyUser({
          userId: loop.userId,
          type: NotificationTypeEnum.AFFIRMATION_LOOP_FAILED,
          requestId: `affirmation-loop-failed-${loopId}-${randomUUID()}`,
          channels: [
            { type: NotificationChannelTypeEnum.PUSH },
            { type: NotificationChannelTypeEnum.IN_APP },
          ],
          metadata: {
            title: 'Loop generation failed',
            body: 'Your loop token has been refunded. Please try again.',
            loopId,
            screen: 'affirmation-loop',
          },
        });
      } catch (notifyError) {
        this.logger.warn(
          `Failed to send failure notification for loop ${loopId}: ${
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError)
          }`,
        );
      }
    } catch (updateError) {
      this.logger.error(
        `Failed to mark loop ${loopId} as FAILED: ${
          updateError instanceof Error
            ? updateError.message
            : String(updateError)
        }`,
      );
    }
  }
}
