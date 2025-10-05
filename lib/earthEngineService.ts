import ee from '@google/earthengine';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';

try {
  const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFilePath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS environment variable not set. Please create a .env.local file and set this variable to the path of your service account key file.");
  }

  const keys = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));

  console.log('Authenticating with Google Earth Engine via Private Key...');
  ee.data.authenticateViaPrivateKey(
    keys,
    () => {
      console.log('GEE Authentication successful.');
      ee.initialize(null, null,
        () => { console.log('GEE Initialized.'); },
        (err: any) => { console.error('GEE initialization error:', err); }
      );
    },
    (err: any) => { console.error('GEE authentication error:', err); }
  );

} catch (error) {
  console.error("Failed to initialize Google Cloud services:", error);
}

// This is the correct way to export in a TypeScript/ESM environment.
export const storage = new Storage();
export { ee };