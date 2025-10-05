import ee from '@google/earthengine';
import { Storage } from '@google-cloud/storage';

// By default, the Node.js client libraries will use the credentials
// specified in the GOOGLE_APPLICATION_CREDENTIALS environment variable.
// This is the most robust way to authenticate.
// We no longer need to parse the credentials manually.

// --- Google Cloud Storage Client ---
// It will automatically find and use GOOGLE_APPLICATION_CREDENTIALS
export const storage = new Storage();

// --- Google Earth Engine Client ---
// We still need to authenticate with GEE, but we can do it via the
// automatically detected credentials.
console.log('Authenticating with Google Earth Engine...');
ee.data.authenticateViaOauth(
  null, // Will use ADC (Application Default Credentials)
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
  },
  null,
  () => {
    // This callback runs if user consent is required, which it isn't for service accounts.
    // If it runs, we prompt the user to use the command line to authenticate.
    ee.data.authenticateViaPopup();
  }
);


export { ee };