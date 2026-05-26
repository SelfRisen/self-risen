import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from 'src/common/config';

export const MAX_LOOP_DURATION_SECONDS = 300;
const FADE_SECONDS = 3;
const BACKGROUND_VOLUME = 0.25;

@Injectable()
export class AudioMergeService {
    private readonly logger = new Logger(AudioMergeService.name);

    constructor() {
        if (config.FFMPEG_PATH) {
            ffmpeg.setFfmpegPath(config.FFMPEG_PATH);
        }
    }

    /**
     * Concatenate affirmation tracks, mix with background music, apply fade and cap.
     * Returns output path and duration in seconds.
     */
    async mergeLoopAudio(
        affirmationPaths: string[],
        backgroundPath: string,
        outputPath: string,
        maxDurationSeconds = MAX_LOOP_DURATION_SECONDS,
    ): Promise<number> {
        const cappedMaxDuration = Math.min(
            Math.max(1, maxDurationSeconds),
            MAX_LOOP_DURATION_SECONDS,
        );
        const tmpDir = path.dirname(outputPath);
        const affirmationsPath = path.join(tmpDir, 'affirmations.mp3');

        await this.concatAffirmations(affirmationPaths, affirmationsPath, tmpDir);

        const rawDuration = await this.probeDurationSeconds(affirmationsPath);
        const mixDuration = Math.min(rawDuration, cappedMaxDuration);
        const fadeStart = Math.max(0, mixDuration - FADE_SECONDS);

        await this.mixWithBackground(
            backgroundPath,
            affirmationsPath,
            outputPath,
            mixDuration,
            fadeStart,
        );

        const finalDuration = await this.probeDurationSeconds(outputPath);
        return Math.min(Math.ceil(finalDuration), cappedMaxDuration);
    }

    private async concatAffirmations(
        inputPaths: string[],
        outputPath: string,
        tmpDir: string,
    ): Promise<void> {
        const listPath = path.join(tmpDir, 'concat-list.txt');
        const listContent = inputPaths
            .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
            .join('\n');
        await fs.writeFile(listPath, listContent, 'utf8');

        await this.runFfmpeg((command) =>
            command
                .input(listPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .audioCodec('libmp3lame')
                .audioBitrate('192k')
                .audioFrequency(44100)
                .audioChannels(2)
                .format('mp3')
                .output(outputPath),
        );
    }

    private async mixWithBackground(
        backgroundPath: string,
        affirmationsPath: string,
        outputPath: string,
        durationSeconds: number,
        fadeStartSeconds: number,
    ): Promise<void> {
        const filterComplex =
            `[0:a]volume=${BACKGROUND_VOLUME}[bg];` +
            `[1:a][bg]amix=inputs=2:duration=first:dropout_transition=0[mixed];` +
            `[mixed]afade=t=out:st=${fadeStartSeconds}:d=${FADE_SECONDS}[out]`;

        await this.runFfmpeg((command) =>
            command
                .input(backgroundPath)
                .inputOptions(['-stream_loop', '-1'])
                .input(affirmationsPath)
                .complexFilter(filterComplex)
                .outputOptions([
                    '-map', '[out]',
                    '-t', String(durationSeconds),
                    '-c:a', 'libmp3lame',
                    '-b:a', '192k',
                    '-ar', '44100',
                    '-ac', '2',
                ])
                .format('mp3')
                .output(outputPath),
        );
    }

    async probeDurationSeconds(filePath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    reject(new Error(`ffprobe error: ${err.message}`));
                    return;
                }
                const duration = metadata?.format?.duration ?? 0;
                resolve(duration);
            });
        });
    }

    createTempDir(loopId: string): string {
        const dir = path.join(os.tmpdir(), `audio-merge-${loopId}`);
        fsSync.mkdirSync(dir, { recursive: true });
        return dir;
    }

    async cleanupTempDir(dir: string): Promise<void> {
        try {
            await fs.rm(dir, { recursive: true, force: true });
        } catch (error) {
            this.logger.warn(`Failed to cleanup temp dir ${dir}: ${error.message}`);
        }
    }

    private runFfmpeg(
        configure: (command: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const command = configure(ffmpeg());
            command
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error(`ffmpeg error: ${err.message}`)))
                .run();
        });
    }
}
