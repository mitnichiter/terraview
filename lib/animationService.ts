import { jobs } from './jobStore';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';

const GIBS_URL_TEMPLATE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/9/{y}/{x}.jpg';
const TEMP_DIR = path.join(process.cwd(), 'tmp');
const ZOOM_LEVEL = 9;

interface AnimationParams {
  jobId: string;
  boundingBox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  startDate: string;
  endDate: string;
}

// Helper to download an image, creating a blank tile on 404
async function downloadImage(url: string, filepath: string) {
  try {
    // Increase the timeout to 30 seconds to handle slow responses from NASA's server
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Image not found (404): ${url}. Creating a blank tile.`);
        // Create a blank 512x512 black tile to avoid breaking the animation
        await sharp({
          create: {
            width: 512,
            height: 512,
            channels: 3,
            background: { r: 0, g: 0, b: 0 }
          }
        }).jpeg().toFile(filepath);
        return;
      }
      throw new Error(`Failed to download ${url}: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(buffer));
  } catch (error) {
    console.error(`Error in downloadImage for ${url}:`, error);
    throw error; // Re-throw to be caught by the main try-catch block
  }
}

// Helper to convert longitude/latitude to tile coordinates
function lonLatToTile(lon: number, lat: number, zoom: number): { x: number, y: number } {
  const n = Math.pow(2, zoom);
  const latRad = lat * Math.PI / 180;
  const x = Math.floor(n * ((lon + 180) / 360));
  const y = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2);
  return { x, y };
}

// Helper to get all dates in a range
function getDatesInRange(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];
  let currentDate = start;
  while (currentDate <= end) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

export async function createAnimation({ jobId, boundingBox, startDate, endDate }: AnimationParams) {
  const jobDir = path.join(TEMP_DIR, jobId);

  try {
    await fs.mkdir(jobDir, { recursive: true });
    console.log(`[${jobId}] Starting animation generation...`);

    // --- Day-by-Day Processing Logic ---

    // 1. Calculate constant values outside the loop
    const [minLon, minLat, maxLon, maxLat] = boundingBox;
    const topLeft = lonLatToTile(minLon, maxLat, ZOOM_LEVEL);
    const bottomRight = lonLatToTile(maxLon, minLat, ZOOM_LEVEL);
    const dates = getDatesInRange(startDate, endDate);

    const tileXCoords = Array.from({ length: bottomRight.x - topLeft.x + 1 }, (_, i) => topLeft.x + i);
    const tileYCoords = Array.from({ length: bottomRight.y - topLeft.y + 1 }, (_, i) => topLeft.y + i);
    const gridWidth = tileXCoords.length;
    const gridHeight = tileYCoords.length;
    const frameWidth = gridWidth * 512;
    const frameHeight = gridHeight * 512;

    // 2. Process each day sequentially to keep memory usage low
    for (const [dateIndex, date] of dates.entries()) {
      const dailyJobDir = path.join(jobDir, date);
      await fs.mkdir(dailyJobDir, { recursive: true });
      console.log(`[${jobId}] Processing Day ${dateIndex + 1}/${dates.length} (${date})`);

      // a. Download tiles for the current day
      const downloadPromises = [];
      for (const y of tileYCoords) {
        for (const x of tileXCoords) {
          const url = GIBS_URL_TEMPLATE.replace('{date}', date).replace('{x}', x.toString()).replace('{y}', y.toString());
          const imagePath = path.join(dailyJobDir, `tile_${x}_${y}.jpg`);
          downloadPromises.push(downloadImage(url, imagePath));
        }
      }
      // Use Promise.allSettled to ensure all downloads complete, even if some fail.
      // This prevents the race condition where cleanup starts before all operations are done.
      const results = await Promise.allSettled(downloadPromises);
      const failedDownloads = results.filter(r => r.status === 'rejected').length;
      if (failedDownloads > 0) {
        console.warn(`[${jobId}] ${failedDownloads} tiles failed to download for ${date}. They will be treated as blank tiles.`);
      }
      console.log(`[${jobId}] Finished processing downloads for ${date}`);

      // b. Stitch the downloaded tiles into a single frame for the day
      const compositeOperations = [];
      for (const y of tileYCoords) {
        for (const x of tileXCoords) {
          const tilePath = path.join(dailyJobDir, `tile_${x}_${y}.jpg`);
          const xOffset = (x - tileXCoords[0]) * 512;
          const yOffset = (y - tileYCoords[0]) * 512;
          compositeOperations.push({ input: tilePath, left: xOffset, top: yOffset });
        }
      }

      const framePath = path.join(jobDir, `frame_${String(dateIndex).padStart(4, '0')}.jpg`);
      await sharp({ create: { width: frameWidth, height: frameHeight, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .composite(compositeOperations)
        .toFile(framePath);
      console.log(`[${jobId}] Created frame for ${date}`);

      // c. Clean up the daily tiles immediately to save disk space
      await fs.rm(dailyJobDir, { recursive: true, force: true });
    }

    // 3. Create the final animation from the daily frames
    console.log(`[${jobId}] Creating final animation from ${dates.length} frames...`);
    const animationOutputPath = path.join(process.cwd(), 'public', 'animations', `${jobId}.gif`);
    await fs.mkdir(path.dirname(animationOutputPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(path.join(jobDir, 'frame_%04d.jpg'))
        .inputOptions(['-framerate 10'])
        .outputOptions(['-vf scale=1024:-1'])
        .on('end', () => {
          console.log(`[${jobId}] FFmpeg processing finished.`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[${jobId}] FFmpeg error:`, err);
          reject(err);
        })
        .save(animationOutputPath);
    });

    // 4. Update Job Status on Success
    const animationPath = `/animations/${jobId}.gif`;
    jobs.set(jobId, { status: 'complete', url: animationPath });
    console.log(`[${jobId}] Animation complete: ${animationPath}`);

  } catch (error) {
    console.error(`[${jobId}] Animation failed:`, error);
    jobs.set(jobId, { status: 'failed', error: (error as Error).message });
  } finally {
    // 5. Final Cleanup (remove the main job directory with the frames)
    try {
      await fs.rm(jobDir, { recursive: true, force: true });
      console.log(`[${jobId}] Final cleanup complete.`);
    } catch (cleanupError) {
      console.error(`[${jobId}] Final cleanup failed:`, cleanupError);
    }
  }
}