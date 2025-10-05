import ee from '@google/earthengine';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';

// This is the standard and most robust way to authenticate for server-side applications.
// 1. The GOOGLE_APPLICATION_CREDENTIALS env var holds the PATH to the key file.
// 2. We read that file to get the JSON credentials.
// 3. We use the private key from the file to authenticate with Earth Engine.

try {
  // --- Google Cloud Storage Client ---
  // This client is smart and automatically finds the credentials file.
  const storage = new Storage();

  // --- Google Earth Engine Client ---
  // GEE requires us to explicitly authenticate using the private key.
  const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFilePath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS environment variable not set.");
  }

  const keys = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
  const privateKey = keys.private_key;
  const clientEmail = keys.client_email;

  console.log('Authenticating with Google Earth Engine via Private Key...');
  ee.data.authenticateViaPrivateKey(
    privateKey,
    () => {
      console.log('GEE Authentication successful.');
      ee.initialize(null, null, () => {
        console.log('GEE Initialized.');
      }, (err: any) => {
        console.error('GEE initialization error:', err);
      });
    },
    (err: any) => {
      console.error('GEE authentication error:', err);
    }
  );

  // Export the initialized clients
  module.exports = { ee, storage };

} catch (error) {
  console.error("Failed to initialize Google Cloud services:", error);
  // Export dummy objects to prevent the app from crashing on import if auth fails.
  module.exports = {
    ee: {},
    storage: {
      bucket: () => ({ getFiles: () => Promise.resolve([[]]) })
    }
  };
}