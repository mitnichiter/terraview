import { NextResponse } from 'next/server';
import { ee } from '@/lib/earthEngineService';
import { jobs } from '@/lib/jobStore';

// The name of your Google Cloud Storage bucket
const BUCKET_NAME = 'terrascope-animations'; // IMPORTANT: Replace with your bucket name if different

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  const jobInfo = jobs.get(jobId);

  if (!jobInfo || !jobInfo.geeTaskId) {
    return NextResponse.json({ error: 'Job not found or GEE task ID is missing' }, { status: 404 });
  }

  try {
    // Get the status of the GEE task
    const taskStatus = await new Promise((resolve, reject) => {
      const fullTaskId = `projects/earthengine-legacy/operations/${jobInfo.geeTaskId}`;
      ee.data.getTaskStatus(fullTaskId, (status: any, err: any) => {
        if (err) {
          return reject(err);
        }
        resolve(status);
      });
    });

    const status = (taskStatus as any)?.state;

    // If the state is not yet available, treat it as 'running' to allow polling to continue.
    if (!status) {
      return NextResponse.json({ status: 'running' });
    }

    let response: any = { status: status.toLowerCase() }; // e.g., 'running', 'completed'

    if (status === 'COMPLETED') {
      // GEE doesn't provide the full filename, so we need to list files with the prefix.
      // This is a simplification; a more robust solution would use Pub/Sub notifications.
      const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix: jobInfo.fileNamePrefix });
      if (files.length > 0) {
        response.url = files[0].publicUrl();
      } else {
        response.status = 'failed';
        response.error = 'Completed task but output file not found in bucket.';
      }
    } else if (status === 'FAILED') {
      response.error = (taskStatus as any).error_message;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Failed to get GEE task status for job ${jobId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to get task status.', details: errorMessage }, { status: 500 });
  }
}

// We need to add the GEE Task ID and the filename prefix to our job store interface
declare module '@/lib/jobStore' {
  interface AnimationJob {
    geeTaskId?: string;
    fileNamePrefix?: string;
  }
}