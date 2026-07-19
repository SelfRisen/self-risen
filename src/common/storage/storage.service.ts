import { Injectable, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { SupabaseStorageService } from './supabase-storage.service';
import { CompressionService } from './compression.service';

export enum FileType {
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
}

export enum StorageProvider {
  FIREBASE = 'firebase',
  SUPABASE = 'supabase',
}

export interface UploadResult {
  url: string;
  path: string;
  fileName: string;
  contentType: string;
  size: number;
}

@Injectable()
export class StorageService {
  private readonly provider: StorageProvider;
  private readonly bucket?: any;
  private readonly supabaseService?: SupabaseStorageService;
  private readonly compressionService?: CompressionService;

  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];

  private readonly ALLOWED_AUDIO_TYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    'audio/webm',
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4',
  ];

  private readonly ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/ogg',
  ];

  // Max file sizes (in bytes)
  private readonly MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

  constructor(
    supabaseService?: SupabaseStorageService,
    compressionService?: CompressionService,
  ) {
    // Determine which provider to use (defaults to 'firebase')
    const storageProvider =
      (config.STORAGE_PROVIDER as StorageProvider) || StorageProvider.SUPABASE;
    this.provider = storageProvider;

    console.log(
      `[StorageService] Initializing with provider: ${this.provider}`,
    );

    if (this.provider === StorageProvider.SUPABASE) {
      if (!supabaseService) {
        throw new Error(
          'SupabaseStorageService is required when using Supabase provider',
        );
      }
      this.supabaseService = supabaseService;
      console.log(`[StorageService] Using Supabase Storage`);
    } else {
      // Firebase setup
      const bucketName = config.FIREBASE_STORAGE_BUCKET;
      if (!bucketName) {
        throw new Error('FIREBASE_STORAGE_BUCKET is not configured');
      }
      console.log(
        `[StorageService] Using Firebase Storage with bucket: ${bucketName}`,
      );
      this.bucket = admin.storage().bucket(bucketName);
    }

    this.compressionService = compressionService;
  }

  /**
   * Validate file type and size
   */
  private validateFile(file: Express.Multer.File, fileType: FileType): void {
    const allowedTypes =
      fileType === FileType.IMAGE
        ? this.ALLOWED_IMAGE_TYPES
        : fileType === FileType.AUDIO
          ? this.ALLOWED_AUDIO_TYPES
          : this.ALLOWED_VIDEO_TYPES;

    const maxSize =
      fileType === FileType.IMAGE
        ? this.MAX_IMAGE_SIZE
        : fileType === FileType.AUDIO
          ? this.MAX_AUDIO_SIZE
          : this.MAX_VIDEO_SIZE;

    // Check MIME type
    const fileExtension = file.originalname?.split('.').pop()?.toLowerCase();
    const mimetype = file.mimetype || '';

    if (!mimetype || !allowedTypes.includes(mimetype)) {
      // Fallback: check file extension for common cases (especially for iOS/React Native)
      const extensionToMimeMap: Record<string, string[]> = {
        m4a: ['audio/m4a', 'audio/x-m4a', 'audio/mp4'],
        mp3: ['audio/mpeg', 'audio/mp3'],
        wav: ['audio/wav'],
        ogg: ['audio/ogg'],
        aac: ['audio/aac'],
        webm: ['audio/webm'],
      };

      // If mimetype doesn't match but extension suggests it's a valid audio file, allow it
      if (
        fileType === FileType.AUDIO &&
        fileExtension &&
        extensionToMimeMap[fileExtension]
      ) {
        const expectedMimes = extensionToMimeMap[fileExtension];
        if (expectedMimes.some((mime) => allowedTypes.includes(mime))) {
          // File extension matches an allowed type, proceed with validation
          // The mimetype will be accepted even if it's one of the alternative forms
        } else {
          throw new BadRequestException(
            `Invalid file type. Received mimetype: "${mimetype}", file extension: "${fileExtension}". Allowed types for ${fileType}: ${allowedTypes.join(', ')}`,
          );
        }
      } else {
        throw new BadRequestException(
          `Invalid file type. Received mimetype: "${mimetype}", file extension: "${fileExtension}". Allowed types for ${fileType}: ${allowedTypes.join(', ')}`,
        );
      }
    }

    // Check file size
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${maxSizeMB}MB for ${fileType}`,
      );
    }
  }

  /**
   * Generate a unique file path
   */
  private generateFilePath(
    fileType: FileType,
    userId: string,
    originalName: string,
    folder?: string,
    mimetype?: string,
  ): string {
    const timestamp = Date.now();
    // For compressed images, use .webp extension
    let fileExtension = originalName.split('.').pop();
    if (fileType === FileType.IMAGE && mimetype === 'image/webp') {
      fileExtension = 'webp';
    }
    // For compressed videos, use .mp4 extension
    if (fileType === FileType.VIDEO && mimetype === 'video/mp4') {
      fileExtension = 'mp4';
    }
    const fileName = `${uuidv4()}-${timestamp}.${fileExtension}`;

    if (folder) {
      return `${fileType}s/${folder}/${userId}/${fileName}`;
    }

    return `${fileType}s/${userId}/${fileName}`;
  }

  /**
   * Upload a file
   */
  async uploadFile(
    file: Express.Multer.File,
    fileType: FileType,
    userId: string,
    folder?: string,
  ): Promise<UploadResult> {
    console.log(
      `[StorageService.uploadFile] Provider: ${this.provider}, FileType: ${fileType}, UserId: ${userId}, Folder: ${folder}`,
    );

    if (this.provider === StorageProvider.SUPABASE) {
      console.log(`[StorageService.uploadFile] Using Supabase provider`);
      return this.supabaseService!.uploadFile(file, fileType, userId, folder);
    }

    // Firebase implementation
    console.log(`[StorageService.uploadFile] Using Firebase provider`);
    console.log(
      `[StorageService.uploadFile] Bucket: ${this.bucket?.name || 'NOT SET'}`,
    );

    // Store original file for validation
    const originalFile = { ...file };

    // Compress file if compression service is available
    if (this.compressionService) {
      try {
        if (fileType === FileType.IMAGE) {
          const compressionResult =
            await this.compressionService.compressImage(file);
          if (compressionResult) {
            file.buffer = compressionResult.buffer;
            file.mimetype = compressionResult.mimetype;
            file.size = compressionResult.compressedSize;
            console.log(
              `[StorageService.uploadFile] Image compressed: ${compressionResult.reductionPercentage.toFixed(1)}% reduction`,
            );
          }
        } else if (fileType === FileType.VIDEO) {
          const compressionResult =
            await this.compressionService.compressVideo(file);
          if (compressionResult) {
            file.buffer = compressionResult.buffer;
            file.mimetype = compressionResult.mimetype;
            file.size = compressionResult.compressedSize;
            console.log(
              `[StorageService.uploadFile] Video compressed: ${compressionResult.reductionPercentage.toFixed(1)}% reduction`,
            );
          }
        }
      } catch (error) {
        console.warn(
          `[StorageService.uploadFile] Compression failed, using original file: ${error.message}`,
        );
        // Continue with original file if compression fails
      }
    }

    // Validate file (check original size against limits)
    this.validateFile(originalFile, fileType);

    // Generate file path (use compressed mimetype if available)
    const filePath = this.generateFilePath(
      fileType,
      userId,
      file.originalname,
      folder,
      file.mimetype,
    );
    console.log(`[StorageService.uploadFile] Generated file path: ${filePath}`);

    // Create file reference
    const fileRef = this.bucket.file(filePath);
    console.log(
      `[StorageService.uploadFile] File reference created, attempting upload...`,
    );

    // Set metadata
    const metadata = {
      contentType: file.mimetype,
      metadata: {
        originalName: file.originalname,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        fileType,
      },
    };

    // Upload file
    try {
      console.log(
        `[StorageService.uploadFile] Starting file upload to Firebase...`,
      );
      await fileRef.save(file.buffer, {
        metadata,
        public: false, // Set to true if you want public access
      });
      console.log(
        `[StorageService.uploadFile] File uploaded successfully, generating signed URL...`,
      );

      // Get signed URL (valid for 1 year, adjust as needed)
      const [url] = await fileRef.getSignedUrl({
        action: 'read',
        expires: '03-01-2500', // Far future date
      });
      console.log(
        `[StorageService.uploadFile] Signed URL generated successfully`,
      );

      return {
        url,
        path: filePath,
        fileName: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      };
    } catch (error) {
      console.error(`[StorageService.uploadFile] Upload error:`, {
        code: error.code,
        message: error.message,
        error: error,
        bucketName: config.FIREBASE_STORAGE_BUCKET,
        provider: this.provider,
      });

      // Provide more helpful error messages
      if (error.code === 404 || error.message?.includes('does not exist')) {
        const bucketName = config.FIREBASE_STORAGE_BUCKET;
        throw new BadRequestException(
          `Firebase Storage bucket "${bucketName}" does not exist. Please create the bucket in Firebase Console or check your FIREBASE_STORAGE_BUCKET configuration. Current STORAGE_PROVIDER: ${this.provider}`,
        );
      }
      throw new BadRequestException(
        `Failed to upload file: ${error.message || JSON.stringify(error)}`,
      );
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: Express.Multer.File[],
    fileType: FileType,
    userId: string,
    folder?: string,
  ): Promise<UploadResult[]> {
    if (this.provider === StorageProvider.SUPABASE) {
      return this.supabaseService!.uploadFiles(files, fileType, userId, folder);
    }

    const uploadPromises = files.map((file) =>
      this.uploadFile(file, fileType, userId, folder),
    );
    return Promise.all(uploadPromises);
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(filePath: string): Promise<void> {
    if (this.provider === StorageProvider.SUPABASE) {
      return this.supabaseService!.deleteFile(filePath);
    }

    try {
      const fileRef = this.bucket.file(filePath);
      await fileRef.delete();
    } catch (error) {
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get a signed URL for a file
   */
  async getSignedUrl(
    filePath: string,
    expiresIn: string = '1h',
  ): Promise<string> {
    if (this.provider === StorageProvider.SUPABASE) {
      // Convert expiresIn string to seconds
      const expiresInSeconds = this.parseExpiresIn(expiresIn);
      return this.supabaseService!.getSignedUrl(filePath, expiresInSeconds);
    }

    try {
      const fileRef = this.bucket.file(filePath);
      const [url] = await fileRef.getSignedUrl({
        action: 'read',
        expires: expiresIn,
      });
      return url;
    } catch (error) {
      throw new BadRequestException(
        `Failed to get signed URL: ${error.message}`,
      );
    }
  }

  /**
   * Download a file from a URL or storage path to a local path.
   */
  async downloadToFile(source: string, destPath: string): Promise<void> {
    const url =
      source.startsWith('http://') || source.startsWith('https://')
        ? source
        : await this.getSignedUrl(source, '1h');

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException(
        `Failed to download file: HTTP ${response.status}`,
      );
    }

    if (!response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(destPath, buffer);
      return;
    }

    const nodeStream = Readable.fromWeb(
      response.body as import('stream/web').ReadableStream,
    );
    await pipeline(nodeStream, createWriteStream(destPath));
  }

  /**
   * Upload a buffer to an explicit storage path (e.g. loops/{userId}/{loopId}.mp3).
   */
  async uploadBufferAtPath(
    buffer: Buffer,
    filePath: string,
    contentType: string,
  ): Promise<UploadResult> {
    if (this.provider === StorageProvider.SUPABASE) {
      return this.supabaseService!.uploadBufferAtPath(
        buffer,
        filePath,
        contentType,
      );
    }

    try {
      const fileRef = this.bucket.file(filePath);
      await fileRef.save(buffer, {
        metadata: { contentType },
        public: false,
      });
      const [url] = await fileRef.getSignedUrl({
        action: 'read',
        expires: '03-01-2500',
      });
      return {
        url,
        path: filePath,
        fileName: filePath.split('/').pop() ?? filePath,
        contentType,
        size: buffer.length,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Parse expiresIn string (e.g., '1h', '1d') to seconds
   */
  private parseExpiresIn(expiresIn: string): number {
    // Convert '1h', '1d', etc. to seconds
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * (multipliers[unit] || 3600);
  }
}
