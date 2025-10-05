import ee from '@google/earthengine';
import fs from 'fs';

// Use a singleton pattern to ensure we only initialize once.
let geePromise: Promise<void> | null = null;

/**
 * Initializes the Google Earth Engine API. It handles authentication and initialization,
 * wrapping the entire callback-based process in a single promise. This function is
 * idempotent and can be safely called multiple times.
 * @returns {Promise<void>} A promise that resolves when GEE is ready.
 */
export function initializeGee(): Promise<void> {
  if (geePromise) {
    return geePromise;
  }

  geePromise = new Promise((resolve, reject) => {
    try {
      const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!keyFilePath) {
        throw new Error("GOOGLE_APPLICATION_CREDENTIALS environment variable not set.");
      }

      const keys = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));

      console.log('Authenticating with GEE...');
      ee.data.authenticateViaPrivateKey(
        keys,
        () => {
          console.log('GEE Authentication successful.');
          ee.initialize(null, null,
            () => {
              console.log('GEE Initialized successfully.');
              resolve();
            },
            (err: any) => {
              console.error('GEE initialization error:', err);
              reject(new Error(err));
            }
          );
        },
        (err: any) => {
          console.error('GEE authentication error:', err);
          reject(new Error(err));
        }
      );
    } catch (error) {
      console.error("Failed to start GEE initialization:", error);
      reject(error);
    }
  });

  return geePromise;
}

// Export the Earth Engine object itself for use after initialization.
export { ee };