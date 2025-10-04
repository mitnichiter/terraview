import { NextResponse } from 'next/server';
import { jobs } from '@/lib/jobStore';
import { createAnimation } from '@/lib/animationService';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { boundingBox, startDate, endDate } = await request.json();

    if (!boundingBox || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const jobId = crypto.randomUUID();

    // Add the job to our in-memory store
    jobs.set(jobId, { status: 'processing' });

    // Call the animation function without awaiting it.
    // This is the "fire-and-forget" part of the process.
    createAnimation({ jobId, boundingBox, startDate, endDate });

    console.log(`Job started: ${jobId}`);

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error('Failed to start animation job:', error);
    return NextResponse.json({ error: 'Failed to start animation job' }, { status: 500 });
  }
}