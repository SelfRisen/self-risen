import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { FileType, UploadResult } from './storage.service';
import { CompressionService } from './compression.service';

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private supabase?: SupabaseClient;
  private bucketName?: string;
  private compressionService?: CompressionService;

  // Allowed MIME types for each file type
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
  private readonly MAX_VIDEO_SIZE = Number.MAX_SAFE_INTEGER; // Unlimited
  // private readonly MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

  constructor(compressionService?: CompressionService) {
    // Defer initialization - will be initialized when first used
    // This allows the service to be instantiated even when config is missing
    // (e.g., when using Firebase provider)
    this.compressionService = compressionService;
    this.initialize();
  }

  private initialize() {
    const supabaseUrl = config.SUPABASE_URL;
    const supabaseKey = config.SUPABASE_SERVICE_ROLE_KEY;
    const bucketName = config.SUPABASE_STORAGE_BUCKET;

    if (!supabaseUrl || !supabaseKey || !bucketName) {
      this.logger.warn(
        'Supabase configuration is missing. Service will not be initialized.',
      );
      return;
    }

    this.logger.log(`Initializing Supabase Storage with bucket: ${bucketName}`);
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.bucketName = bucketName;
    this.logger.log('Supabase Storage initialized successfully');
  }

  private ensureInitialized() {
    if (!this.supabase || !this.bucketName) {
      throw new Error(
        'Supabase configuration is missing. Please configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET',
      );
    }
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

    this.logger.debug(
      `Validating file - Type: ${fileType}, Max size: ${maxSize === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `${(maxSize / (1024 * 1024)).toFixed(2)}MB`}, Allowed MIME types: ${allowedTypes.join(', ')}`,
    );

    // Check MIME type
    const fileExtension = file.originalname?.split('.').pop()?.toLowerCase();
    const mimetype = file.mimetype || '';

    this.logger.debug(
      `File details - Original name: ${file.originalname}, Extension: ${fileExtension}, MIME type: ${mimetype}, Size: ${file.size} bytes`,
    );

    if (!mimetype || !allowedTypes.includes(mimetype)) {
      // Fallback: check file extension for common cases (especially for iOS/React Native)
      const audioExtensionToMimeMap: Record<string, string[]> = {
        m4a: ['audio/m4a', 'audio/x-m4a', 'audio/mp4'],
        mp3: ['audio/mpeg', 'audio/mp3'],
        wav: ['audio/wav'],
        ogg: ['audio/ogg'],
        aac: ['audio/aac'],
        webm: ['audio/webm'],
      };

      const videoExtensionToMimeMap: Record<string, string[]> = {
        mov: ['video/quicktime', 'video/mp4'],
        mp4: ['video/mp4', 'video/mpeg'],
        mpeg: ['video/mpeg'],
        mpg: ['video/mpeg'],
        avi: ['video/x-msvideo'],
        webm: ['video/webm'],
        ogv: ['video/ogg'],
      };

      let isValidExtension = false;

      if (
        fileType === FileType.AUDIO &&
        fileExtension &&
        audioExtensionToMimeMap[fileExtension]
      ) {
        const expectedMimes = audioExtensionToMimeMap[fileExtension];
        if (expectedMimes.some((mime) => allowedTypes.includes(mime))) {
          isValidExtension = true;
        }
      } else if (
        fileType === FileType.VIDEO &&
        fileExtension &&
        videoExtensionToMimeMap[fileExtension]
      ) {
        const expectedMimes = videoExtensionToMimeMap[fileExtension];
        if (expectedMimes.some((mime) => allowedTypes.includes(mime))) {
          isValidExtension = true;
        }
      }

      if (!isValidExtension) {
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
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    file: Express.Multer.File,
    fileType: FileType,
    userId: string,
    folder?: string,
  ): Promise<UploadResult> {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    this.logger.log(
      `Starting upload - Type: ${fileType}, File: ${file.originalname}, Size: ${fileSizeMB}MB, MIME: ${file.mimetype}, User: ${userId}`,
    );

    this.ensureInitialized();

    // Verify bucket exists and is accessible
    if (!this.bucketName) {
      throw new BadRequestException(
        'Supabase Storage bucket is not configured. Please set SUPABASE_STORAGE_BUCKET environment variable.',
      );
    }

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
            this.logger.log(
              `Image compressed: ${compressionResult.reductionPercentage.toFixed(1)}% reduction`,
            );
          }
        } else if (fileType === FileType.VIDEO) {
          const compressionResult =
            await this.compressionService.compressVideo(file);
          if (compressionResult) {
            file.buffer = compressionResult.buffer;
            file.mimetype = compressionResult.mimetype;
            file.size = compressionResult.compressedSize;
            this.logger.log(
              `Video compressed: ${compressionResult.reductionPercentage.toFixed(1)}% reduction`,
            );
          }
        }
      } catch (error) {
        this.logger.warn(
          `Compression failed, using original file: ${error.message}`,
        );
        // Continue with original file if compression fails
      }
    }

    // Validate file (check original size against limits)
    this.validateFile(originalFile, fileType);
    this.logger.debug('File validation passed');

    // Generate file path (use compressed mimetype if available)
    const filePath = this.generateFilePath(
      fileType,
      userId,
      file.originalname,
      folder,
      file.mimetype,
    );
    this.logger.debug(`Generated file path: ${filePath}`);

    try {
      this.logger.log(
        `Uploading to bucket: ${this.bucketName}, Path: ${filePath}, Buffer size: ${file.buffer?.length || 0} bytes`,
      );

      // Upload file to Supabase Storage
      const uploadStartTime = Date.now();
      const { error } = await this.supabase!.storage.from(
        this.bucketName,
      ).upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false, // Set to true if you want to overwrite existing files
        metadata: {
          originalName: file.originalname,
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
          fileType,
        },
      });

      const uploadDuration = Date.now() - uploadStartTime;
      this.logger.debug(`Upload request completed in ${uploadDuration}ms`);

      if (error) {
        this.logger.error(
          `Supabase upload error - Message: ${error.message}, Error: ${JSON.stringify(error)}`,
        );

        // Provide more helpful error messages for common Supabase errors
        if (
          error.message?.includes('Bucket not found') ||
          error.message?.includes('does not exist')
        ) {
          throw new BadRequestException(
            `Supabase Storage bucket "${this.bucketName}" does not exist. Please create the bucket in Supabase Dashboard or check your SUPABASE_STORAGE_BUCKET configuration.`,
          );
        }

        if (error.message?.includes('new row violates row-level security')) {
          throw new BadRequestException(
            `Upload failed: Row-level security policy violation. Please check your Supabase bucket policies.`,
          );
        }

        throw new BadRequestException(
          `Failed to upload file to Supabase: ${error.message || JSON.stringify(error)}`,
        );
      }

      this.logger.log(`File uploaded successfully. Path: ${filePath}`);

      // Get public URL (bucket must be set to public in Supabase Dashboard)
      this.logger.debug('Generating public URL...');
      const { data: publicUrlData } = this.supabase!.storage.from(
        this.bucketName,
      ).getPublicUrl(filePath);

      this.logger.log(
        `Upload completed successfully for file: ${file.originalname}`,
      );
      return {
        url: publicUrlData.publicUrl,
        path: filePath,
        fileName: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      };
    } catch (error) {
      this.logger.error(
        `Upload failed - File: ${file.originalname}, Type: ${fileType}, Size: ${fileSizeMB}MB, Error: ${error.message}`,
      );
      this.logger.error(`Error stack: ${error.stack}`);
      this.logger.error(
        `Error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Check for specific error types
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        this.logger.error(
          `Network/fetch error detected. This could indicate: network connectivity issues, CORS problems, or Supabase service unavailability.`,
        );
      }

      throw new BadRequestException(`Failed to upload file: ${error.message}`);
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
    const uploadPromises = files.map((file) =>
      this.uploadFile(file, fileType, userId, folder),
    );
    return Promise.all(uploadPromises);
  }

  /**
   * Delete a file from Supabase Storage
   */
  async deleteFile(filePath: string): Promise<void> {
    this.ensureInitialized();
    try {
      const { error } = await this.supabase!.storage.from(
        this.bucketName!,
      ).remove([filePath]);

      if (error) {
        throw new BadRequestException(
          `Failed to delete file: ${error.message}`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Upload a buffer to an explicit storage path.
   */
  async uploadBufferAtPath(
    buffer: Buffer,
    filePath: string,
    contentType: string,
  ): Promise<UploadResult> {
    this.ensureInitialized();

    try {
      const { error } = await this.supabase!.storage.from(
        this.bucketName!,
      ).upload(filePath, buffer, {
        contentType,
        upsert: true,
      });

      if (error) {
        throw new BadRequestException(
          `Failed to upload file: ${error.message}`,
        );
      }

      const signedUrl = await this.getSignedUrl(filePath, 3600);

      return {
        url: signedUrl,
        path: filePath,
        fileName: filePath.split('/').pop() ?? filePath,
        contentType,
        size: buffer.length,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Get a signed URL for a file (for private buckets)
   */
  async getSignedUrl(
    filePath: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    this.ensureInitialized();
    try {
      const { data, error } = await this.supabase!.storage.from(
        this.bucketName!,
      ).createSignedUrl(filePath, expiresIn);

      if (error || !data) {
        throw new BadRequestException(
          `Failed to get signed URL: ${error?.message || 'Unknown error'}`,
        );
      }

      return data.signedUrl;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to get signed URL: ${error.message}`,
      );
    }
  }
}
