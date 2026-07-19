import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { config, setupConfig } from './common';
import * as dotenv from 'dotenv';
import * as admin from 'firebase-admin';

// Load environment variables
dotenv.config();

async function bootstrap() {
  try {
    const error = await setupConfig();
    // setupConfig resolves to a class-validator ValidationError, which is not
    // an Error subclass — wrap it so stack traces and handlers behave.
    if (error) throw new Error(`Invalid configuration: ${error.toString()}`);

    // Initialize Firebase Admin SDK BEFORE NestJS app starts
    // This ensures our credentials are used when the @alpha018/nestjs-firebase-auth module checks for existing apps
    if (
      config.FIREBASE_PROJECT_ID &&
      config.FIREBASE_PRIVATE_KEY &&
      config.FIREBASE_CLIENT_EMAIL
    ) {
      // Only initialize if not already initialized
      if (admin.apps.length === 0) {
        console.log(
          'Initializing Firebase Admin SDK directly with credentials...',
        );
        const credentials = {
          projectId: config.FIREBASE_PROJECT_ID,
          privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: config.FIREBASE_CLIENT_EMAIL,
          ...(config.FIREBASE_PRIVATE_KEY_ID && {
            privateKeyId: config.FIREBASE_PRIVATE_KEY_ID,
          }),
          ...(config.FIREBASE_CLIENT_ID && {
            clientId: config.FIREBASE_CLIENT_ID,
          }),
        };

        admin.initializeApp({
          credential: admin.credential.cert(credentials),
          projectId: config.FIREBASE_PROJECT_ID,
          storageBucket: config.FIREBASE_STORAGE_BUCKET,
        });
        console.log(
          '✓ Firebase Admin SDK initialized successfully with credentials',
        );
      } else {
        console.log(
          'Firebase Admin SDK already initialized, using existing app',
        );
      }
    }

    const app = await NestFactory.create(AppModule, { snapshot: true });
    app.enableCors();

    const swaggarConfig = new DocumentBuilder()
      .setTitle('SELF-RISEN API')
      .addBearerAuth({ type: 'http' }, 'firebase')
      .build();
    SwaggerModule.setup(
      '/api/documentation',
      app,
      SwaggerModule.createDocument(app, swaggarConfig),
      {
        swaggerOptions: { persistAuthorization: true },
      },
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors) => {
          const messages = errors.flatMap((error) =>
            Object.values(error.constraints ?? {}),
          );
          return new BadRequestException(
            messages.join(' ') || 'Invalid request data.',
          );
        },
      }),
    );

    await app.listen(process.env.PORT ?? 8080);

    if (config.NODE_ENV == 'development' || config.NODE_ENV == 'staging') {
      const link = config.BASE_URL;
      const docLink = `${link}/api/documentation`;
      console.log(`Vast Manager is running on: ${link}`);
      console.log(`Swagger documentation: ${docLink}`);
    }
  } catch (error) {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  }
}
bootstrap();
