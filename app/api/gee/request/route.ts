import { NextResponse } from 'next/server';
import { ee, storage } from '@/lib/earthEngineService';
import * as recipes from '@/lib/animationRecipes';
import { jobs } from '@/lib/jobStore'; // We'll reuse our simple job store for mapping our ID to GEE's task ID.
import crypto from 'crypto';

// The name of your Google Cloud Storage bucket
const BUCKET_NAME = 'terrascope-animations'; // IMPORTANT: Replace with your bucket name if different

export async function POST(request: Request) {
  try {
    const { boundingBox, startDate, endDate, recipeName } = await request.json();

    if (!boundingBox || !startDate || !endDate || !recipeName) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Find the correct recipe function by name
    const recipeFunction = (recipes as any)[recipeName];
    if (typeof recipeFunction !== 'function') {
      return NextResponse.json({ error: `Invalid recipe name: ${recipeName}` }, { status: 400 });
    }

    const eeBoundingBox = ee.Geometry.Rectangle(boundingBox);

    // Get the styled image collection from the recipe
    const videoCollection = recipeFunction({
      boundingBox: eeBoundingBox,
      startDate,
      endDate,
    });

    const videoFileName = `${recipeName}_${Date.now()}`;

    // Create the GEE export task
    const task = ee.batch.Export.video.toCloudStorage({
      collection: videoCollection,
      description: `Export for job ${videoFileName}`,
      bucket: BUCKET_NAME,
      fileNamePrefix: videoFileName,
      framesPerSecond: 10,
      dimensions: 720, // 720p resolution
      region: eeBoundingBox,
    });

    // Start the task and get its ID
    task.start();
    const geeTaskId = task.id;

    // Map our internal job ID to the GEE task ID and other necessary info
    const internalJobId = crypto.randomUUID();
    jobs.set(internalJobId, {
      status: 'processing',
      geeTaskId,
      fileNamePrefix: videoFileName,
    });

    console.log(`[${internalJobId}] GEE task started with ID: ${geeTaskId}`);

    return NextResponse.json({ jobId: internalJobId });

  } catch (error) {
    console.error('Failed to start GEE task:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to start Earth Engine task.', details: errorMessage }, { status: 500 });
  }
}