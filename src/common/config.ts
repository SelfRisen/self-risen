import { plainToInstance, Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional, IsString, validate } from "class-validator";

class Config {
    @IsNotEmpty()
    @IsString()
    BASE_URL: string;

    @IsNotEmpty()
    @IsString()
    DATABASE_URL: string;

    @IsNotEmpty()
    @IsString()
    JWT_SECRET: string;

    @IsNotEmpty()
    @IsString()
    JWT_EXPIRATION: string;

    @IsNotEmpty()
    @IsNumber()
    @Type(() => Number)
    PORT: number;

    @IsNotEmpty()
    @IsString()
    NODE_ENV: string;

    // @IsNotEmpty()
    // @IsString()
    // EMAIL_RESET_PASSWORD_URL: string;

    // @IsNotEmpty()
    // @IsString()
    // EMAIL_USER: string;

    // @IsNotEmpty()
    // @IsString()
    // EMAIL_PASSWORD: string;

    // @IsNotEmpty()
    // @IsString()
    // JWT_VERIFICATION_TOKEN_SECRET: string;

    @IsNotEmpty()
    @IsString()
    MAIL_USERNAME: string;

    @IsNotEmpty()
    @IsString()
    MAIL_PASSWORD: string;

    @IsNotEmpty()
    @IsString()
    OAUTH_CLIENTID: string;

    @IsNotEmpty()
    @IsString()
    OAUTH_CLIENT_SECRET: string;

    @IsNotEmpty()
    @IsString()
    OAUTH_REFRESH_TOKEN: string;

    @IsNotEmpty()
    @IsString()
    FRONTEND_URL: string;

    // Firebase Configuration
    @IsNotEmpty()
    @IsString()
    FIREBASE_PROJECT_ID: string;

    @IsNotEmpty()
    @IsString()
    FIREBASE_PRIVATE_KEY: string;

    @IsNotEmpty()
    @IsString()
    FIREBASE_CLIENT_EMAIL: string;


    @IsNotEmpty()
    @IsString()
    FIREBASE_API_KEY: string;


    // Optional Firebase fields (have defaults)
    FIREBASE_PRIVATE_KEY_ID?: string;
    FIREBASE_CLIENT_ID?: string;

    @IsNotEmpty()
    @IsString()
    FIREBASE_STORAGE_BUCKET: string;

    // Apple Sign-In Configuration
    // APPLE_CLIENT_ID: Services ID for web-based Apple Sign-In (required)
    // APPLE_BUNDLE_ID: Bundle ID for native iOS/macOS apps (optional, only needed if supporting mobile)
    @IsNotEmpty()
    @IsString()
    APPLE_CLIENT_ID: string;

    // @IsNotEmpty()
    // @IsString()
    // APPLE_BUNDLE_ID?: string;

    @IsNotEmpty()
    @IsString()
    SUPABASE_URL: string;

    @IsNotEmpty()
    @IsString()
    SUPABASE_SERVICE_ROLE_KEY: string;

    @IsNotEmpty()
    @IsString()
    SUPABASE_STORAGE_BUCKET: string;

    // Storage Provider Selection (optional, defaults to 'firebase')
    @IsNotEmpty()
    @IsString()
    STORAGE_PROVIDER: string;

    // Redis Configuration
    @IsNotEmpty()
    @IsString()
    REDIS_HOST: string;

    @IsNotEmpty()
    @IsNumber()
    @Type(() => Number)
    REDIS_PORT: number;

    @IsNotEmpty()
    @IsString()
    REDIS_PASSWORD?: string;


    // // Twilio Configuration
    // TWILIO_ACCOUNT_SID?: string;
    // TWILIO_AUTH_TOKEN?: string;
    // TWILIO_PHONE_NUMBER?: string;

    // OpenAI Configuration
    @IsNotEmpty()
    @IsString()
    OPENAI_API_KEY: string;

    @IsNotEmpty()
    @IsString()
    OPENAI_MODEL: string;

    @IsNotEmpty()
    @IsString()
    OPENAI_NLP_MODEL: string;

    @IsNotEmpty()
    @IsString()
    OPENAI_TTS_MODEL: string;

    @IsNotEmpty()
    @IsString()
    OPENAI_TTS_VOICE: string;

    @IsNotEmpty()
    @IsString()
    OPENAI_TRANSCRIPTION_MODEL: string;

    @IsNotEmpty()
    @IsNumber()
    OPENAI_REQUEST_TIMEOUT_MS: number;

    @IsNotEmpty()
    @IsString()
    ENABLE_IMAGE_COMPRESSION: string;

    @IsNotEmpty()
    @IsString()
    ENABLE_VIDEO_COMPRESSION: string;

    @IsNotEmpty()
    @IsNumber()
    COMPRESSION_QUALITY_SMALL: number;

    @IsNotEmpty()
    @IsNumber()
    COMPRESSION_QUALITY_MEDIUM: number;

    @IsNotEmpty()
    @IsNumber()
    COMPRESSION_QUALITY_LARGE: number;

    // Optional: Custom path to ffmpeg binary (useful if ffmpeg is not in PATH)
    FFMPEG_PATH?: string;
}

export let config: Config;
// export let config: Config = plainToInstance(Config, { ...process.env });

export const setupConfig = async () => {
    config = plainToInstance(Config, process.env, {
        enableImplicitConversion: true,
    });
    const [error] = await validate(config, { whitelist: true })
    if (error) return error;
}
