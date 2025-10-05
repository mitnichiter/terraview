import { NextResponse } from 'next/server';
import { ee } from '@/lib/earthEngineService';
import * as recipes from '@/lib/animationRecipes';
import { promisify } from 'util';

// Promisify the GEE get video thumb URL function
const getVideoThumbURL = promisify(ee.ImageCollection.prototype.getVideoThumbURL);

export async function POST(request: Request) {
  try {
    const { boundingBox, startDate, endDate, recipeName } = await request.json();

    if (!boundingBox || !startDate || !endDate || !recipeName) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const recipeFunction = (recipes as any)[recipeName];
    if (typeof recipeFunction !== 'function') {
      return NextResponse.json({ error: `Invalid recipe name: ${recipeName}` }, { status: 400 });
    }

    const eeBoundingBox = ee.Geometry.Rectangle(boundingBox);

    const videoCollection = recipeFunction({
      boundingBox: eeBoundingBox,
      startDate,
      endDate,
    });

    // Define the parameters for the video thumbnail
    const videoParams = {
      dimensions: 720,
      region: eeBoundingBox,
      framesPerSecond: 10,
      // Optional: Add other parameters like crs, format, etc.
    };

    console.log("Requesting animation from GEE...");

    // Call the promisified function
    const url = await getVideoThumbURL.call(videoCollection, videoParams);

    console.log("Successfully generated animation URL:", url);

    // Return the URL directly to the client
    return NextResponse.json({ animationUrl: url });

  } catch (error) {
    console.error('Failed to generate GEE animation:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to generate Earth Engine animation.', details: errorMessage }, { status: 500 });
  }
}