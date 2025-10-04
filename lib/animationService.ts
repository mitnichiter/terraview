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
    const response = await fetch(url);
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

    // 1. Tile Calculation
    const [minLon, minLat, maxLon, maxLat] = boundingBox;
    const topLeft = lonLatToTile(minLon, maxLat, ZOOM_LEVEL);
    const bottomRight = lonLatToTile(maxLon, minLat, ZOOM_LEVEL);

    const dates = getDatesInRange(startDate, endDate);
    const imageUrls: { date: string, url: string, x: number, y: number }[] = [];

    for (const date of dates) {
      for (let y = topLeft.y; y <= bottomRight.y; y++) {
        for (let x = topLeft.x; x <= bottomRight.x; x++) {
          const url = GIBS_URL_TEMPLATE
            .replace('{date}', date)
            .replace('{x}', x.toString())
            .replace('{y}', y.toString());
          imageUrls.push({ date, url, x, y });
        }
      }
    }
    console.log(`[${jobId}] Calculated ${imageUrls.length} tiles to fetch across ${dates.length} days.`);

    // 2. Image Fetching
    console.log(`[${jobId}] Fetching images...`);
    await Promise.all(imageUrls.map((imageInfo, index) => {
        const { date, x, y } = imageInfo;
        const imagePath = path.join(jobDir, `tile_${date}_${x}_${y}.jpg`);
        process.stdout.write(`\r[${jobId}] Downloading image ${index + 1} of ${imageUrls.length}`);
        return downloadImage(imageInfo.url, imagePath);
    }));
    process.stdout.write('\n'); // New line after progress indicator

    // 3. Image Stitching
    console.log(`[${jobId}] Stitching daily frames...`);
    const tileXCoords = [...new Set(imageUrls.map(t => t.x))].sort((a, b) => a - b);
    const tileYCoords = [...new Set(imageUrls.map(t => t.y))].sort((a, b) => a - b);
    const gridWidth = tileXCoords.length;
    const gridHeight = tileYCoords.length;
    const frameWidth = gridWidth * 512;
    const frameHeight = gridHeight * 512;

    for (const [index, date] of dates.entries()) {
      const dailyTiles = imageUrls.filter(img => img.date === date);

      const compositeOperations = dailyTiles.map(tile => {
        const tilePath = path.join(jobDir, `tile_${tile.date}_${tile.x}_${tile.y}.jpg`);
        const xOffset = (tile.x - tileXCoords[0]) * 512;
        const yOffset = (tile.y - tileYCoords[0]) * 512;
        return { input: tilePath, left: xOffset, top: yOffset };
      });

      const framePath = path.join(jobDir, `frame_${String(index).padStart(4, '0')}.jpg`);
      await sharp({ create: { width: frameWidth, height: frameHeight, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .composite(compositeOperations)
        .toFile(framePath);

      process.stdout.write(`\r[${jobId}] Created frame ${index + 1} of ${dates.length}`);
    }
    process.stdout.write('\n');

    // 4. Video/GIF Generation
    console.log(`[${jobId}] Creating animation with FFmpeg...`);
    const animationOutputPath = path.join(process.cwd(), 'public', 'animations', `${jobId}.gif`);
    await fs.mkdir(path.dirname(animationOutputPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(path.join(jobDir, 'frame_%04d.jpg'))
        .inputOptions(['-framerate 10'])
        .outputOptions(['-vf scale=1024:-1'])
        .on('end', resolve)
        .on('error', reject)
        .save(animationOutputPath);
    });

    // 5. Update Job Status on Success
    const animationPath = `/animations/${jobId}.gif`;
    jobs.set(jobId, { status: 'complete', url: animationPath });
    console.log(`[${jobId}] Animation complete: ${animationPath}`);

  } catch (error) {
    console.error(`[${jobId}] Animation failed:`, error);
    jobs.set(jobId, { status: 'failed', error: (error as Error).message });
  } finally {
    // 6. Cleanup
    await fs.rm(jobDir, { recursive: true, force: true });
    console.log(`[${jobId}] Cleanup complete.`);
  }
}