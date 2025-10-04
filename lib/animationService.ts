import { jobs } from './jobStore';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';

const GIBS_URL_TEMPLATE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/9/{y}/{x}.jpg';
const TEMP_DIR = path.join(process.cwd(), 'tmp');
const ZOOM_LEVEL = 9;
const BATCH_GRID_DIMENSION = 16; // Process in 16x16 tile batches

interface AnimationParams {
  jobId: string;
  boundingBox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  startDate: string;
  endDate: string;
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

// Helper to download an image, creating a blank tile on 404
async function downloadImage(url: string, filepath: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      if (response.status === 404) {
        await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toFile(filepath);
        return;
      }
      throw new Error(`Failed to download ${url}: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(buffer));
  } catch (error) {
    // If ANY error occurs during download (timeout, network issue, etc.),
    // log it and create a blank tile to prevent the entire job from failing.
    console.warn(`Download failed for ${url}: ${(error as Error).message}. Creating a blank tile.`);
    await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toFile(filepath);
  }
}

/**
 * Creates a video clip for a small batch of tiles.
 */
async function createBatchVideo(jobId: string, batchJobDir: string, tileXCoords: number[], tileYCoords: number[], dates: string[]): Promise<string> {
  const frameWidth = tileXCoords.length * 512;
  const frameHeight = tileYCoords.length * 512;

  for (const [dateIndex, date] of dates.entries()) {
    const dailyTileDir = path.join(batchJobDir, date);
    await fs.mkdir(dailyTileDir, { recursive: true });

    const downloadPromises = [];
    for (const y of tileYCoords) {
      for (const x of tileXCoords) {
        const url = GIBS_URL_TEMPLATE.replace('{date}', date).replace('{x}', x.toString()).replace('{y}', y.toString());
        const imagePath = path.join(dailyTileDir, `tile_${x}_${y}.jpg`);
        downloadPromises.push(downloadImage(url, imagePath));
      }
    }
    await Promise.allSettled(downloadPromises);

    const compositeOperations = [];
    for (const y of tileYCoords) {
      for (const x of tileXCoords) {
        const tilePath = path.join(dailyTileDir, `tile_${x}_${y}.jpg`);
        const xOffset = (x - tileXCoords[0]) * 512;
        const yOffset = (y - tileYCoords[0]) * 512;
        compositeOperations.push({ input: tilePath, left: xOffset, top: yOffset });
      }
    }

    const framePath = path.join(batchJobDir, `frame_${String(dateIndex).padStart(4, '0')}.jpg`);
    await sharp({ create: { width: frameWidth, height: frameHeight, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite(compositeOperations)
      .toFile(framePath);

    await fs.rm(dailyTileDir, { recursive: true, force: true });
  }

  const batchClipPath = path.join(batchJobDir, 'batch_clip.mp4');
  await new Promise<void>((resolve, reject) => {
    ffmpeg(path.join(batchJobDir, 'frame_%04d.jpg'))
      .inputOptions(['-framerate 10'])
      .outputOptions(['-c:v libx264', '-pix_fmt yuv420p'])
      .on('end', resolve)
      .on('error', reject)
      .save(batchClipPath);
  });

  return batchClipPath;
}

export async function createAnimation({ jobId, boundingBox, startDate, endDate }: AnimationParams) {
  const jobDir = path.join(TEMP_DIR, jobId);
  try {
    await fs.mkdir(jobDir, { recursive: true });
    console.log(`[${jobId}] Starting animation generation with batch processing...`);

    const [minLon, minLat, maxLon, maxLat] = boundingBox;
    const topLeft = lonLatToTile(minLon, maxLat, ZOOM_LEVEL);
    const bottomRight = lonLatToTile(maxLon, minLat, ZOOM_LEVEL);
    const dates = getDatesInRange(startDate, endDate);

    const fullTileXCoords = Array.from({ length: bottomRight.x - topLeft.x + 1 }, (_, i) => topLeft.x + i);
    const fullTileYCoords = Array.from({ length: bottomRight.y - topLeft.y + 1 }, (_, i) => topLeft.y + i);

    const numBatchCols = Math.ceil(fullTileXCoords.length / BATCH_GRID_DIMENSION);
    const numBatchRows = Math.ceil(fullTileYCoords.length / BATCH_GRID_DIMENSION);

    console.log(`[${jobId}] Total area divided into ${numBatchCols}x${numBatchRows} batches.`);

    const batchClipPaths: string[][] = Array.from({ length: numBatchRows }, () => []);

    for (let row = 0; row < numBatchRows; row++) {
      for (let col = 0; col < numBatchCols; col++) {
        console.log(`[${jobId}] Processing batch (${row + 1}, ${col + 1}) of ${numBatchRows}x${numBatchCols}`);

        const batchXStart = col * BATCH_GRID_DIMENSION;
        const batchYStart = row * BATCH_GRID_DIMENSION;
        const batchXCoords = fullTileXCoords.slice(batchXStart, batchXStart + BATCH_GRID_DIMENSION);
        const batchYCoords = fullTileYCoords.slice(batchYStart, batchYStart + BATCH_GRID_DIMENSION);

        const batchJobDir = path.join(jobDir, `batch_${row}_${col}`);
        await fs.mkdir(batchJobDir, { recursive: true });

        const clipPath = await createBatchVideo(jobId, batchJobDir, batchXCoords, batchYCoords, dates);
        batchClipPaths[row][col] = clipPath;
      }
    }

    console.log(`[${jobId}] All batch clips created. Now stitching into final animation...`);
    const finalComplexFilter: any[] = [];
    let inputIndex = 0;
    for (let row = 0; row < numBatchRows; row++) {
      for (let col = 0; col < numBatchCols; col++) {
        finalComplexFilter.push(`[${inputIndex}:v]`);
        inputIndex++;
      }
      finalComplexFilter.push(`hstack=${numBatchCols}[row${row}];`);
    }

    for (let row = 0; row < numBatchRows; row++) {
        finalComplexFilter.push(`[row${row}]`);
    }
    finalComplexFilter.push(`vstack=${numBatchRows}[v]`);

    const ffmpegCommand = ffmpeg();
    batchClipPaths.flat().forEach(p => ffmpegCommand.input(p));

    const animationOutputPath = path.join(process.cwd(), 'public', 'animations', `${jobId}.gif`);
    await fs.mkdir(path.dirname(animationOutputPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      ffmpegCommand
        .complexFilter(finalComplexFilter.join(''))
        // The -map option is not needed here, as the complex filter defines the final output stream [v]
        .on('end', resolve)
        .on('error', reject)
        .save(animationOutputPath);
    });

    const animationPath = `/animations/${jobId}.gif`;
    jobs.set(jobId, { status: 'complete', url: animationPath });
    console.log(`[${jobId}] Animation complete: ${animationPath}`);

  } catch (error) {
    console.error(`[${jobId}] Animation failed:`, error);
    jobs.set(jobId, { status: 'failed', error: (error as Error).message });
  } finally {
    try {
      await fs.rm(jobDir, { recursive: true, force: true });
      console.log(`[${jobId}] Final cleanup complete.`);
    } catch (cleanupError) {
      console.error(`[${jobId}] Final cleanup failed:`, cleanupError);
    }
  }
}