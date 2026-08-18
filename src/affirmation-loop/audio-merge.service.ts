import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from 'src/common/config';

export const MAX_LOOP_DURATION_SECONDS = 900;
const FADE_SECONDS = 3;
// Background keeps playing this long after the last affirmation ends, so the
// fade-out lands on music alone instead of clipping the final spoken words.
const OUTRO_TAIL_SECONDS = 4;
const BACKGROUND_VOLUME = 0.25;
// The background is pulled down further while an affirmation is speaking and
// allowed back up in the gaps between them. Lowering BACKGROUND_VOLUME alone
// would have made the music inaudible throughout instead of only ducking it
// where it competes with the words.
const DUCK_THRESHOLD = 0.02;
const DUCK_RATIO = 8;
const DUCK_ATTACK_MS = 20;
const DUCK_RELEASE_MS = 400;
// Silence held between affirmations. Back-to-back lines read too fast to
// follow; a pause gives each one room to land before the next begins.
const AFFIRMATION_GAP_SECONDS = 2;
const MAX_INTRO_SKIP_SECONDS = 20;
const INTRO_SILENCE_NOISE_DB = '-30dB';
const INTRO_SILENCE_MIN_DURATION = 0.5;

@Injectable()
export class AudioMergeService {
  private readonly logger = new Logger(AudioMergeService.name);
  private readonly introSkipCache = new Map<string, number>();

  constructor() {
    if (config.FFMPEG_PATH) {
      ffmpeg.setFfmpegPath(config.FFMPEG_PATH);
    }
  }

  /**
   * Concatenate affirmation tracks, mix with background music, apply fade and cap.
   * Returns the duration in seconds and where each affirmation begins.
   *
   * The offsets are the running total of the inputs' own durations. MP3
   * concatenation can add a few milliseconds of frame padding per join, so a
   * long loop may drift slightly from the true position -- close enough to
   * skip to an affirmation, not close enough to cut audio on.
   *
   * @param backgroundCacheKey - Stable identifier for the background track (e.g. its
   * source URL), used to cache its detected intro length across merges instead of
   * re-running silence detection on every loop that uses the same track.
   */
  async mergeLoopAudio(
    affirmationPaths: string[],
    backgroundPath: string,
    outputPath: string,
    maxDurationSeconds = MAX_LOOP_DURATION_SECONDS,
    backgroundCacheKey?: string,
  ): Promise<{ durationSeconds: number; affirmationOffsets: number[] }> {
    const cappedMaxDuration = Math.min(
      Math.max(1, maxDurationSeconds),
      MAX_LOOP_DURATION_SECONDS,
    );
    const tmpDir = path.dirname(outputPath);
    const affirmationsPath = path.join(tmpDir, 'affirmations.mp3');

    // Probed before the concat, while each affirmation is still its own file.
    // Afterwards there is nothing in the output marking where one ends.
    const affirmationOffsets =
      await this.measureAffirmationOffsets(affirmationPaths);

    await this.concatAffirmations(affirmationPaths, affirmationsPath, tmpDir);

    const rawDuration = await this.probeDurationSeconds(affirmationsPath);
    const mixDuration = Math.min(
      rawDuration + OUTRO_TAIL_SECONDS,
      cappedMaxDuration,
    );
    const fadeStart = Math.max(0, mixDuration - FADE_SECONDS);
    const introSkipSeconds = await this.getBackgroundIntroSkipSeconds(
      backgroundPath,
      backgroundCacheKey,
    );

    await this.mixWithBackground(
      backgroundPath,
      affirmationsPath,
      outputPath,
      mixDuration,
      fadeStart,
      introSkipSeconds,
    );

    const finalDuration = await this.probeDurationSeconds(outputPath);
    const durationSeconds = Math.min(
      Math.ceil(finalDuration),
      cappedMaxDuration,
    );

    // An offset past the end would send the player somewhere that doesn't
    // exist, which is worse than not offering the skip at all.
    return {
      durationSeconds,
      affirmationOffsets: affirmationOffsets.filter((o) => o < durationSeconds),
    };
  }

  /**
   * Start time of each affirmation, in seconds, first always at 0.
   */
  private async measureAffirmationOffsets(
    inputPaths: string[],
  ): Promise<number[]> {
    const offsets: number[] = [];
    let running = 0;

    for (const [index, inputPath] of inputPaths.entries()) {
      offsets.push(Number(running.toFixed(3)));
      try {
        running += await this.probeDurationSeconds(inputPath);
      } catch {
        // One unreadable file shouldn't cost the whole loop its skip points;
        // the offsets after it are wrong, so stop rather than mislead.
        return offsets;
      }
      // The gap sits between affirmations, so every one but the last pushes
      // the next start time out. Missing this would drift every skip point.
      if (index < inputPaths.length - 1) {
        running += AFFIRMATION_GAP_SECONDS;
      }
    }

    return offsets;
  }

  /**
   * A silent MP3 used to space affirmations apart. Encoded to match them so
   * the concat demuxer joins it without re-encoding surprises.
   */
  private async createSilenceTrack(
    tmpDir: string,
    seconds: number,
  ): Promise<string> {
    const silencePath = path.join(tmpDir, 'affirmation-gap.mp3');

    await this.runFfmpeg((command) =>
      command
        .input('anullsrc=r=44100:cl=stereo')
        .inputOptions(['-f', 'lavfi', '-t', String(seconds)])
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .audioFrequency(44100)
        .audioChannels(2)
        .format('mp3')
        .output(silencePath),
    );

    return silencePath;
  }

  private async concatAffirmations(
    inputPaths: string[],
    outputPath: string,
    tmpDir: string,
  ): Promise<void> {
    const listPath = path.join(tmpDir, 'concat-list.txt');
    const quote = (p: string) => `file '${p.replace(/'/g, "'\\''")}'`;

    // Interleave silence so the spoken lines are paced apart rather than
    // running straight into one another.
    const silencePath =
      inputPaths.length > 1
        ? await this.createSilenceTrack(tmpDir, AFFIRMATION_GAP_SECONDS)
        : null;

    const entries: string[] = [];
    inputPaths.forEach((inputPath, index) => {
      entries.push(quote(inputPath));
      if (silencePath && index < inputPaths.length - 1) {
        entries.push(quote(silencePath));
      }
    });

    await fs.writeFile(listPath, entries.join('\n'), 'utf8');

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
    introSkipSeconds = 0,
  ): Promise<void> {
    // duration=longest lets the looped background run past the end of the
    // affirmations track (the -t output option truncates it to the intended
    // length), so the closing fade covers music only, not spoken words.
    // The affirmation track is split: one copy is heard, the other keys a
    // sidechain compressor on the music. `apad` keeps the key running past the
    // last affirmation so the compressor releases cleanly and the outro fade
    // lands on music at full level.
    const filterComplex =
      `[0:a]volume=${BACKGROUND_VOLUME}[bg];` +
      `[1:a]asplit=2[voice][sc];` +
      `[sc]apad[sckey];` +
      `[bg][sckey]sidechaincompress=` +
      `threshold=${DUCK_THRESHOLD}:ratio=${DUCK_RATIO}:` +
      `attack=${DUCK_ATTACK_MS}:release=${DUCK_RELEASE_MS}[ducked];` +
      `[voice][ducked]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[mixed];` +
      `[mixed]afade=t=out:st=${fadeStartSeconds}:d=${FADE_SECONDS}[out]`;

    const backgroundInputOptions = ['-stream_loop', '-1'];
    if (introSkipSeconds > 0) {
      // Seek past the track's baked-in intro before looping, so affirmations
      // aren't front-loaded with the intro's dead air on every repeat.
      backgroundInputOptions.unshift('-ss', String(introSkipSeconds));
    }

    await this.runFfmpeg((command) =>
      command
        .input(backgroundPath)
        .inputOptions(backgroundInputOptions)
        .input(affirmationsPath)
        .complexFilter(filterComplex)
        .outputOptions([
          '-map',
          '[out]',
          '-t',
          String(durationSeconds),
          '-c:a',
          'libmp3lame',
          '-b:a',
          '192k',
          '-ar',
          '44100',
          '-ac',
          '2',
        ])
        .format('mp3')
        .output(outputPath),
    );
  }

  private async getBackgroundIntroSkipSeconds(
    backgroundPath: string,
    cacheKey?: string,
  ): Promise<number> {
    if (cacheKey && this.introSkipCache.has(cacheKey)) {
      return this.introSkipCache.get(cacheKey)!;
    }

    const skipSeconds = await this.detectIntroSkipSeconds(backgroundPath);

    if (cacheKey) {
      this.introSkipCache.set(cacheKey, skipSeconds);
    }

    return skipSeconds;
  }

  /**
   * Detects a quiet lead-in at the start of a background track using ffmpeg's
   * silencedetect filter, so it can be skipped before looping the track under
   * affirmations. Best-effort: returns 0 (no skip) if nothing is detected or the
   * probe fails, so a bad detection never breaks a merge.
   */
  private detectIntroSkipSeconds(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      let stderrOutput = '';

      ffmpeg()
        .input(filePath)
        .outputOptions([
          '-af',
          `silencedetect=noise=${INTRO_SILENCE_NOISE_DB}:d=${INTRO_SILENCE_MIN_DURATION}`,
          '-f',
          'null',
        ])
        .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
        .on('stderr', (line: string) => {
          stderrOutput += `${line}\n`;
        })
        .on('end', () => {
          const match = stderrOutput.match(/silence_end:\s*([\d.]+)/);
          const seconds = match ? parseFloat(match[1]) : 0;
          resolve(
            Number.isFinite(seconds) && seconds > 0
              ? Math.min(seconds, MAX_INTRO_SKIP_SECONDS)
              : 0,
          );
        })
        .on('error', (err) => {
          this.logger.warn(
            `Intro-skip detection failed for ${filePath}: ${err.message}`,
          );
          resolve(0);
        })
        .run();
    });
  }

  async probeDurationSeconds(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(
            new Error(
              `ffprobe error: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
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
      this.logger.warn(
        `Failed to cleanup temp dir ${dir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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
