import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WheelOfLifeModule } from './wheel-of-life/wheel-of-life.module';
import { StorageModule } from './common/storage/storage.module';
import { ReflectionModule } from './reflection/reflection.module';
import { VisionBoardModule } from './vision-board/vision-board.module';
import { JournalModule } from './journal/journal.module';
import { FirebaseAdminModule } from '@alpha018/nestjs-firebase-auth';
import { ExtractJwt } from 'passport-jwt';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { config } from './common';
import { CommonModule } from './common/common.module';
import { StaterVideosModule } from './stater-videos/stater-videos.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    CommonModule,
    FirebaseAdminModule.forRootAsync({
      useFactory: () => {
        // If Firebase is already initialized in main.ts, don't pass options
        // The module's buggy code will use getApp() which will get our initialized app
        if (admin.apps.length > 0) {
          console.log('Firebase already initialized in main.ts, module will reuse existing app');
          // Don't pass options - let the module use getApp() to get our initialized app
          return {
            auth: {
              config: {
                extractor: ExtractJwt.fromAuthHeaderAsBearerToken(),
                checkRevoked: true,
                validateRole: false,
              },
            },
          };
        }

        const projectId = config.FIREBASE_PROJECT_ID;
        const privateKey = config.FIREBASE_PRIVATE_KEY;
        const clientEmail = config.FIREBASE_CLIENT_EMAIL;
        const privateKeyId = config.FIREBASE_PRIVATE_KEY_ID;
        const clientId = config.FIREBASE_CLIENT_ID;

        // Debug logging
        console.log('=== Firebase Configuration Debug ===');
        console.log('Project ID:', projectId ? `✓ Set (${projectId})` : '✗ Missing');
        console.log('Client Email:', clientEmail ? `✓ Set (${clientEmail})` : '✗ Missing');
        console.log('Private Key:', privateKey ? `✓ Set (${privateKey.length} chars)` : '✗ Missing');

        // Fallback to JSON file if env vars are missing
        if (!projectId || !privateKey || !clientEmail) {
          console.log('Environment variables missing, trying to load from firebase-credentials.json...');
          const credentialsPath = path.join(process.cwd(), 'firebase-credentials.json');

          if (fs.existsSync(credentialsPath)) {
            try {
              const fileContent = fs.readFileSync(credentialsPath, 'utf-8');
              const fileCredentials = JSON.parse(fileContent);

              const credentials = {
                projectId: fileCredentials.project_id,
                privateKey: fileCredentials.private_key.replace(/\\n/g, '\n'),
                clientEmail: fileCredentials.client_email,
                ...(fileCredentials.private_key_id && { privateKeyId: fileCredentials.private_key_id }),
                ...(fileCredentials.client_id && { clientId: fileCredentials.client_id }),
              };

              console.log('✓ Loaded credentials from firebase-credentials.json');

              const storageBucket = config.FIREBASE_STORAGE_BUCKET;
              return {
                credential: admin.credential.cert(credentials),
                options: {
                  projectId: credentials.projectId,
                  ...(storageBucket && { storageBucket }),
                },
                auth: {
                  config: {
                    extractor: ExtractJwt.fromAuthHeaderAsBearerToken(),
                    checkRevoked: true,
                    validateRole: false,
                  },
                },
              };
            } catch (error) {
              console.error('Failed to load from JSON file:', error.message);
            }
          }

          throw new Error(
            `Missing required Firebase credentials. ProjectId: ${!!projectId}, PrivateKey: ${!!privateKey}, ClientEmail: ${!!clientEmail}`
          );
        }

        // Validate private key format
        if (!privateKey.includes('BEGIN PRIVATE KEY')) {
          throw new Error('FIREBASE_PRIVATE_KEY is missing "BEGIN PRIVATE KEY" marker');
        }

        // Process private key - handle both \n and actual newlines
        let processedPrivateKey = privateKey.trim();

        // Remove surrounding quotes if present
        if ((processedPrivateKey.startsWith('"') && processedPrivateKey.endsWith('"')) ||
          (processedPrivateKey.startsWith("'") && processedPrivateKey.endsWith("'"))) {
          processedPrivateKey = processedPrivateKey.slice(1, -1);
        }

        // Replace literal \n with actual newlines
        processedPrivateKey = processedPrivateKey.replace(/\\n/g, '\n');

        // Ensure proper formatting - should have newlines between markers and key content
        if (!processedPrivateKey.includes('\n')) {
          // If no newlines found, try to add them (this shouldn't happen but just in case)
          processedPrivateKey = processedPrivateKey.replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n')
            .replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----');
        }

        // Firebase Admin SDK expects camelCase properties
        const credentials = {
          projectId,
          privateKey: processedPrivateKey,
          clientEmail,
          ...(privateKeyId && { privateKeyId }),
          ...(clientId && { clientId }),
        };

        console.log('Creating Firebase credential with projectId:', credentials.projectId);
        console.log('Private key length:', credentials.privateKey.length);
        console.log('Private key has newlines:', credentials.privateKey.includes('\n'));
        console.log('Private key starts with:', credentials.privateKey.substring(0, 50));
        console.log('Private key ends with:', credentials.privateKey.substring(credentials.privateKey.length - 50));

        try {
          const certCredential = admin.credential.cert(credentials);
          console.log('✓ Firebase credential object created successfully');

          // Verify the credential can actually get an access token
          // This will fail if credentials are invalid
          console.log('Testing credential by getting access token...');
          certCredential.getAccessToken()
            .then((token) => {
              console.log('✓ Credential verified - access token obtained successfully');
            })
            .catch((err) => {
              console.error('✗ Credential verification failed:', err.message);
              console.error('This means the credentials are invalid or the service account lacks permissions');
            });

          // The module expects 'options' to be passed directly to initializeApp
          // We need to structure it correctly
          const storageBucket = config.FIREBASE_STORAGE_BUCKET;
          return {
            options: {
              credential: certCredential,
              projectId,
              ...(storageBucket && { storageBucket }),
            },
            auth: {
              config: {
                extractor: ExtractJwt.fromAuthHeaderAsBearerToken(),
                checkRevoked: true,
                validateRole: false,
              },
            },
          };
        } catch (error) {
          console.error('✗ Failed to create Firebase credential:', error.message);
          throw new Error(`Invalid Firebase credentials: ${error.message}`);
        }
      },
    }),
    AuthModule,
    UserModule,
    DatabaseModule,
    NotificationsModule,
    WheelOfLifeModule,
    StorageModule,
    ReflectionModule,
    VisionBoardModule,
    JournalModule,
    StaterVideosModule,
    // JwtModule.registerAsync({
    //   useFactory: () => ({
    //     secret: config.JWT_SECRET,
    //     signOptions: { expiresIn: '1h' },
    //   }),
    //   global: true
    // }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
