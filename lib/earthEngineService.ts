import ee from '@google/earthengine';
import { Storage } from '@google-cloud/storage';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS!);

// --- Google Cloud Storage Client ---
export const storage = new Storage({
  credentials,
  projectId: credentials.project_id,
});

// --- Google Earth Engine Client ---
// We need to authenticate with GEE using the service account credentials.
// This is a one-time setup process per server start.
const privateKey = credentials.private_key;
const clientEmail = credentials.client_email;

console.log('Authenticating with Google Earth Engine...');
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

export { ee };