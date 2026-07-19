import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

export function loadFirebaseCredentials(): object {
  // Priority 1: Load from individual environment variables
  if (
    config.FIREBASE_PROJECT_ID &&
    config.FIREBASE_PRIVATE_KEY &&
    config.FIREBASE_CLIENT_EMAIL
  ) {
    const credentials: any = {
      type: 'service_account',
      project_id: config.FIREBASE_PROJECT_ID,
      private_key: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Replace literal \n with actual newlines
      client_email: config.FIREBASE_CLIENT_EMAIL,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      universe_domain: 'googleapis.com',
    };

    // Add optional fields if provided
    if (config.FIREBASE_PRIVATE_KEY_ID) {
      credentials.private_key_id = config.FIREBASE_PRIVATE_KEY_ID;
    }
    if (config.FIREBASE_CLIENT_ID) {
      credentials.client_id = config.FIREBASE_CLIENT_ID;
    }
    if (config.FIREBASE_CLIENT_EMAIL) {
      const encodedEmail = encodeURIComponent(config.FIREBASE_CLIENT_EMAIL);
      credentials.client_x509_cert_url = `https://www.googleapis.com/robot/v1/metadata/x509/${encodedEmail}`;
    }

    console.log(
      'Successfully loaded Firebase credentials from environment variables',
    );
    console.log('Project ID:', credentials.project_id);
    return credentials;
  }

  // Priority 2: Try FIREBASE_CREDENTIALS as JSON string (backward compatibility)
  if (process.env.FIREBASE_CREDENTIALS) {
    try {
      const credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);

      // Validate that we have the required fields
      if (
        !credentials.project_id ||
        !credentials.private_key ||
        !credentials.client_email
      ) {
        throw new Error(
          'Firebase credentials missing required fields (project_id, private_key, client_email)',
        );
      }

      // Replace literal \n with actual newlines in private_key (needed for env vars)
      if (
        credentials.private_key &&
        typeof credentials.private_key === 'string'
      ) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      console.log(
        'Successfully loaded Firebase credentials from FIREBASE_CREDENTIALS JSON',
      );
      console.log('Project ID:', credentials.project_id);
      return credentials;
    } catch {
      console.warn(
        'Failed to parse FIREBASE_CREDENTIALS from environment, falling back to file',
      );
    }
  }

  // Priority 3: Fallback to file (local development)
  const credentialsPath = path.join(process.cwd(), 'firebase-credentials.json');

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      'Firebase credentials not found. Please provide:\n' +
        '  - Individual env vars: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL\n' +
        '  - OR FIREBASE_CREDENTIALS JSON string\n' +
        '  - OR firebase-credentials.json file',
    );
  }

  const fileContent = fs.readFileSync(credentialsPath, 'utf-8').trim();
  const credentials = JSON.parse(fileContent);
  console.log('Successfully loaded Firebase credentials from file');
  return credentials;
}
