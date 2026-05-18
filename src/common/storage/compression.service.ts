import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../config';

export interface CompressionResult {
  buffer: Buffer;
  mimetype: string;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
}

@Injectable()
export class CompressionService {
  private readonly logger = new Logger(CompressionService.name);

  private readonly QUALITY_SMALL: number;
  private readonly QUALITY_MEDIUM: number;
  private readonly QUALITY_LARGE: number;
  private readonly ENABLE_IMAGE_COMPRESSION: boolean;
  private readonly ENABLE_VIDEO_COMPRESSION: boolean;

  constructor() {
    this.QUALITY_SMALL = config.COMPRESSION_QUALITY_SMALL ?? 85; // < 100KB
    this.QUALITY_MEDIUM = config.COMPRESSION_QUALITY_MEDIUM ?? 75; // 100KB - 1MB
    this.QUALITY_LARGE = config.COMPRESSION_QUALITY_LARGE ?? 65; // > 1MB
    this.ENABLE_IMAGE_COMPRESSION =
      config.ENABLE_IMAGE_COMPRESSION !== 'false'; // Default to true
    this.ENABLE_VIDEO_COMPRESSION =
      config.ENABLE_VIDEO_COMPRESSION !== 'false'; // Default to true
  }

  // Max dimensions for images (optional resize)
  private readonly MAX_IMAGE_WIDTH = 1920;
  private readonly MAX_IMAGE_HEIGHT = 1920;

  // Minimum file size to compress (skip very small files)
  private readonly MIN_COMPRESS_SIZE = 10 * 1024; // 10KB

  // Maximum output size for compressed videos
  private readonly MAX_VIDEO_OUTPUT_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MAX_COMPRESSION_ATTEMPTS = 3;

  /**
   * Compress an image using Sharp
   * Converts to WebP format with adaptive quality
   */
  async compressImage(
    file: Express.Multer.File,
    options?: { skipIfSmall?: boolean },
  ): Promise<CompressionResult | null> {
    // Check if image compression is enabled
    if (!this.ENABLE_IMAGE_COMPRESSION) {
      this.logger.debug('Image compression is disabled');
      return null;
    }

    const originalSize = file.size;
    const mimetype = file.mimetype || '';

    // Skip SVG files (vector format, compression not beneficial)
    if (mimetype === 'image/svg+xml') {
      this.logger.debug('Skipping compression for SVG file');
      return null;
    }

    // Skip very small files if option is set
    if (options?.skipIfSmall && originalSize < this.MIN_COMPRESS_SIZE) {
      this.logger.debug(`Skipping compression for small file (${originalSize} bytes)`);
      return null;
    }

    try {
      // Determine quality based on file size
      let quality: number;
      if (originalSize < 100 * 1024) {
        quality = this.QUALITY_SMALL;
      } else if (originalSize < 1024 * 1024) {
        quality = this.QUALITY_MEDIUM;
      } else {
        quality = this.QUALITY_LARGE;
      }

      this.logger.debug(
        `Compressing image: ${file.originalname}, Original size: ${(originalSize / 1024).toFixed(2)}KB, Quality: ${quality}%`,
      );

      // Compress image using Sharp
      const compressedBuffer = await sharp(file.buffer)
        .resize(this.MAX_IMAGE_WIDTH, this.MAX_IMAGE_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer();

      const compressedSize = compressedBuffer.length;
      const reductionPercentage =
        ((originalSize - compressedSize) / originalSize) * 100;

      this.logger.log(
        `Image compressed: ${file.originalname} - ${(originalSize / 1024).toFixed(2)}KB → ${(compressedSize / 1024).toFixed(2)}KB (${reductionPercentage.toFixed(1)}% reduction)`,
      );

      return {
        buffer: compressedBuffer,
        mimetype: 'image/webp',
        originalSize,
        compressedSize,
        reductionPercentage,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to compress image ${file.originalname}: ${error.message}. Using original file.`,
      );
      return null; // Return null to indicate compression failed, use original
    }
  }

  /**
   * Compress a video using ffmpeg
   * Converts to MP4 (H.264 codec) with adaptive bitrate
   */
  async compressVideo(
    file: Express.Multer.File,
    options?: { skipIfSmall?: boolean },
  ): Promise<CompressionResult | null> {
    // Check if video compression is enabled
    if (!this.ENABLE_VIDEO_COMPRESSION) {
      this.logger.debug('Video compression is disabled');
      return null;
    }

    const originalSize = file.size;

    // Skip very small files if option is set
    if (options?.skipIfSmall && originalSize < this.MIN_COMPRESS_SIZE * 10) {
      this.logger.debug(`Skipping compression for small video file (${originalSize} bytes)`);
      return null;
    }

    // Check if ffmpeg is available
    try {
      await this.checkFfmpegAvailable();
    } catch (error) {
      this.logger.warn(
        `ffmpeg not available: ${error.message}. Skipping video compression.`,
      );
      return null;
    }

    const inputExt = this.getExtensionFromMime(file.mimetype);
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `ffmpeg-input-${Date.now()}${inputExt}`);

    try {
      // Write input to temp file for probing and compression
      fs.writeFileSync(inputPath, file.buffer);

      // Get video duration to calculate target bitrate
      const durationSecs = await this.getVideoDuration(inputPath);
      this.logger.debug(`Video duration: ${durationSecs.toFixed(1)}s`);

      // Calculate bitrate to fit within MAX_VIDEO_OUTPUT_SIZE
      // Formula: bitrate (bits/s) = target_size_bits / duration
      // Reserve ~128kbps for audio
      const audioBitrate = 128 * 1024; // 128kbps in bits/s
      const maxVideoBitrate = Math.floor(
        (this.MAX_VIDEO_OUTPUT_SIZE * 8) / durationSecs - audioBitrate,
      );

      // Start with either the calculated bitrate or a reasonable default
      let targetBitrateNum: number;
      if (originalSize <= this.MAX_VIDEO_OUTPUT_SIZE) {
        // Already under limit — use moderate compression
        targetBitrateNum = Math.min(2_000_000, maxVideoBitrate);
      } else {
        // Use 90% of calculated max to leave margin
        targetBitrateNum = Math.floor(maxVideoBitrate * 0.9);
      }
      // Floor at 200kbps to avoid unwatchable output
      targetBitrateNum = Math.max(targetBitrateNum, 200_000);

      let compressedBuffer: Buffer | null = null;

      for (let attempt = 1; attempt <= this.MAX_COMPRESSION_ATTEMPTS; attempt++) {
        const targetBitrate = `${Math.floor(targetBitrateNum / 1000)}k`;
        this.logger.debug(
          `Compression attempt ${attempt}/${this.MAX_COMPRESSION_ATTEMPTS}: ${file.originalname}, Original: ${(originalSize / (1024 * 1024)).toFixed(2)}MB, Target bitrate: ${targetBitrate}`,
        );

        compressedBuffer = await this.compressVideoWithFfmpeg(
          inputPath,
          targetBitrate,
        );

        const compressedSize = compressedBuffer.length;
        this.logger.debug(
          `Attempt ${attempt} result: ${(compressedSize / (1024 * 1024)).toFixed(2)}MB`,
        );

        if (compressedSize <= this.MAX_VIDEO_OUTPUT_SIZE) {
          break;
        }

        // Reduce bitrate proportionally for next attempt
        const ratio = this.MAX_VIDEO_OUTPUT_SIZE / compressedSize;
        targetBitrateNum = Math.floor(targetBitrateNum * ratio * 0.9);
        targetBitrateNum = Math.max(targetBitrateNum, 200_000);
        this.logger.warn(
          `Compressed size ${(compressedSize / (1024 * 1024)).toFixed(2)}MB exceeds ${(this.MAX_VIDEO_OUTPUT_SIZE / (1024 * 1024)).toFixed(0)}MB limit, retrying with lower bitrate`,
        );
      }

      const compressedSize = compressedBuffer!.length;
      const reductionPercentage =
        ((originalSize - compressedSize) / originalSize) * 100;

      if (compressedSize > this.MAX_VIDEO_OUTPUT_SIZE) {
        this.logger.warn(
          `Could not compress ${file.originalname} below ${(this.MAX_VIDEO_OUTPUT_SIZE / (1024 * 1024)).toFixed(0)}MB after ${this.MAX_COMPRESSION_ATTEMPTS} attempts (final: ${(compressedSize / (1024 * 1024)).toFixed(2)}MB)`,
        );
      }

      this.logger.log(
        `Video compressed: ${file.originalname} - ${(originalSize / (1024 * 1024)).toFixed(2)}MB → ${(compressedSize / (1024 * 1024)).toFixed(2)}MB (${reductionPercentage.toFixed(1)}% reduction)`,
      );

      return {
        buffer: compressedBuffer!,
        mimetype: 'video/mp4',
        originalSize,
        compressedSize,
        reductionPercentage,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to compress video ${file.originalname}: ${error.message}. Using original file.`,
      );
      return null;
    } finally {
      try { fs.unlinkSync(inputPath); } catch {}
    }
  }

  /**
   * Check if ffmpeg is available on the system
   */
  private async checkFfmpegAvailable(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use ffmpeg.getAvailableEncoders to check if ffmpeg is available
      // This is a lightweight check that doesn't require a file
      ffmpeg.getAvailableEncoders((err, encoders) => {
        if (err) {
          // If we can't get encoders, ffmpeg is likely not installed
          reject(new Error('ffmpeg binary not found or not accessible'));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get file extension from MIME type for temp file creation
   */
  private getExtensionFromMime(mimetype: string): string {
    const mimeToExt: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'video/webm': '.webm',
      'video/mpeg': '.mpeg',
      'video/ogg': '.ogv',
    };
    return mimeToExt[mimetype] || '.mp4';
  }

  /**
   * Get video duration in seconds using ffprobe
   */
  private async getVideoDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(new Error(`ffprobe error: ${err.message}`));
          return;
        }
        const duration = metadata?.format?.duration;
        if (!duration || duration <= 0) {
          reject(new Error('Could not determine video duration'));
          return;
        }
        resolve(duration);
      });
    });
  }

  /**
   * Compress video using ffmpeg with temp files
   * Uses temp files instead of streams so ffmpeg can seek (required for MOV, AVI, etc.)
   */
  private async compressVideoWithFfmpeg(
    inputPath: string,
    targetBitrate: string,
  ): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const outputPath = path.join(tmpDir, `ffmpeg-output-${Date.now()}.mp4`);

    try {
      const compressedBuffer = await new Promise<Buffer>((resolve, reject) => {
        ffmpeg(inputPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions([
            '-preset fast',
            `-b:v ${targetBitrate}`,
            '-maxrate', targetBitrate,
            '-bufsize', `${parseInt(targetBitrate) * 2}k`,
            '-movflags +faststart',
          ])
          .format('mp4')
          .on('error', (err) => {
            reject(new Error(`ffmpeg error: ${err.message}`));
          })
          .on('end', () => {
            try {
              const result = fs.readFileSync(outputPath);
              resolve(result);
            } catch (readErr) {
              reject(new Error(`Failed to read compressed output: ${readErr.message}`));
            }
          })
          .save(outputPath);
      });

      return compressedBuffer;
    } finally {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
}
