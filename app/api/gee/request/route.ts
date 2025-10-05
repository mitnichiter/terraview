import { NextResponse } from 'next/server';
import { ee, initializeGee } from '@/lib/earthEngineService';
import * as recipes from '@/lib/animationRecipes';

/**
 * Wraps the GEE getVideoThumbURL callback in a Promise for async/await usage.
 * The GEE library uses a non-standard callback signature (result, error),
 * which is not compatible with util.promisify.
 * @param {ee.ImageCollection} collection The image collection to turn into a video.
 * @param {object} params The parameters for the video export.
 * @returns {Promise<string>} A promise that resolves with the video URL or rejects with an error.
 */
function getVideoUrl(collection: ee.ImageCollection, params: object): Promise<string> {
  return new Promise((resolve, reject) => {
    collection.getVideoThumbURL(params, (url, error) => {
      if (error) {
        console.error("GEE Error:", error);
        return reject(new Error(error));
      }
      if (!url) {
        // This case can happen if the operation is cancelled or has no data.
        return reject(new Error('Google Earth Engine did not return a URL.'));
      }
      resolve(url);
    });
  });
}


export async function POST(request: Request) {
  try {
    // Ensure GEE is initialized before making any API calls
    await initializeGee();

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

    const videoParams = {
      dimensions: 720,
      region: eeBoundingBox,
      framesPerSecond: 10,
    };

    console.log("Requesting animation from GEE...");

    const url = await getVideoUrl(videoCollection, videoParams);

    console.log("Successfully generated animation URL:", url);

    return NextResponse.json({ animationUrl: url });

  } catch (error) {
    console.error('Failed to generate GEE animation:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to generate Earth Engine animation.', details: errorMessage }, { status: 500 });
  }
}