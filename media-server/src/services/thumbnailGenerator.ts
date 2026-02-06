/**
 * Thumbnail Generator Service
 * Generates video thumbnails (first frame) using ffmpeg
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as redisService from './redisService';
import { getRedisClient } from './redisService';

const execAsync = promisify(exec);

// Determine project root directory (same logic as mediaServer.ts)
let projectRoot = __dirname;
const normalizedDir = projectRoot.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src/services')) {
  projectRoot = path.dirname(path.dirname(projectRoot));
} else if (normalizedDir.endsWith('/dist/src/services')) {
  projectRoot = path.dirname(path.dirname(path.dirname(projectRoot)));
}

const SNAPSHOTS_DIR = path.join(projectRoot, 'data', 'videos', 'snapshots');
const SNAPSHOT_PREFIX = 'snapshot:'; // Redis key prefix for tracking snapshots

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  console.log(`📁 [ThumbnailGenerator] Created snapshots directory: ${SNAPSHOTS_DIR}`);
}

/**
 * Get ffmpeg command path
 */
function getFfmpegCommand(): string {
  // Check common Windows installation path
  const windowsPath = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
  if (fs.existsSync(windowsPath)) {
    return windowsPath;
  }
  
  // Check alternative Windows path
  const altWindowsPath = 'C:\\ffmpeg\\ffmpeg.exe';
  if (fs.existsSync(altWindowsPath)) {
    return altWindowsPath;
  }
  
  // Fallback to system PATH
  return 'ffmpeg';
}

/**
 * Check if ffmpeg is available
 */
async function isFfmpegAvailable(): Promise<boolean> {
  try {
    const ffmpegCmd = getFfmpegCommand();
    await execAsync(`"${ffmpegCmd}" -version`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if snapshot exists for a video
 */
export async function hasSnapshot(videoId: string): Promise<boolean> {
  // Check Redis first
  const redis = getRedisClient();
  if (redis && redisService.isRedisAvailable()) {
    try {
      const exists = await redis.get(`${SNAPSHOT_PREFIX}${videoId}`);
      if (exists === '1') {
        return true;
      }
    } catch (error: any) {
      console.warn(`⚠️ [ThumbnailGenerator] Redis check error: ${error.message}`);
    }
  }

  // Fallback: check filesystem
  const jpegPath = path.join(SNAPSHOTS_DIR, `${videoId}.jpeg`);
  const pngPath = path.join(SNAPSHOTS_DIR, `${videoId}.png`);
  return fs.existsSync(jpegPath) || fs.existsSync(pngPath);
}

/**
 * Get snapshot path for a video
 */
export function getSnapshotPath(videoId: string): string | null {
  const jpegPath = path.join(SNAPSHOTS_DIR, `${videoId}.jpeg`);
  const pngPath = path.join(SNAPSHOTS_DIR, `${videoId}.png`);
  
  if (fs.existsSync(jpegPath)) {
    return jpegPath;
  }
  if (fs.existsSync(pngPath)) {
    return pngPath;
  }
  return null;
}

/**
 * Get snapshot URL for a video
 */
export function getSnapshotUrl(videoId: string): string | null {
  const snapshotPath = getSnapshotPath(videoId);
  if (!snapshotPath) {
    return null;
  }
  
  // Return relative URL that will be served by media server
  // Use the videoId with the appropriate extension
  const ext = path.extname(snapshotPath).toLowerCase();
  const filename = `${videoId}${ext}`;
  return `/api/media/snapshot/${filename}`;
}

/**
 * Generate thumbnail for a video (first frame)
 */
export async function generateThumbnail(videoPath: string, videoId: string): Promise<string | null> {
  try {
    // Check if ffmpeg is available
    const ffmpegAvailable = await isFfmpegAvailable();
    if (!ffmpegAvailable) {
      console.warn(`⚠️ [ThumbnailGenerator] ffmpeg not available, cannot generate thumbnail for ${videoId}`);
      return null;
    }

    // Check if snapshot already exists
    if (await hasSnapshot(videoId)) {
      console.log(`✅ [ThumbnailGenerator] Snapshot already exists for ${videoId}`);
      return getSnapshotUrl(videoId);
    }

    // Get ffmpeg command
    const ffmpegCmd = getFfmpegCommand();
    
    // Generate snapshot (try JPEG first, fallback to PNG)
    const jpegPath = path.join(SNAPSHOTS_DIR, `${videoId}.jpeg`);
    const pngPath = path.join(SNAPSHOTS_DIR, `${videoId}.png`);
    
    // Try JPEG first (smaller file size)
    try {
      // Extract first frame at 1 second (more reliable than 0)
      // Use quotes around ffmpeg path to handle spaces
      await execAsync(`"${ffmpegCmd}" -i "${videoPath}" -ss 00:00:01 -vframes 1 -q:v 2 "${jpegPath}" -y`);
      
      if (fs.existsSync(jpegPath)) {
        // Mark in Redis
        const redis = getRedisClient();
        if (redis && redisService.isRedisAvailable()) {
          await redis.set(`${SNAPSHOT_PREFIX}${videoId}`, '1');
        }
        console.log(`✅ [ThumbnailGenerator] Generated snapshot: ${jpegPath}`);
        return getSnapshotUrl(videoId);
      }
    } catch (error: any) {
      console.warn(`⚠️ [ThumbnailGenerator] JPEG generation failed, trying PNG: ${error.message}`);
    }

    // Fallback to PNG
    try {
      await execAsync(`"${ffmpegCmd}" -i "${videoPath}" -ss 00:00:01 -vframes 1 "${pngPath}" -y`);
      
      if (fs.existsSync(pngPath)) {
        // Mark in Redis
        const redis = getRedisClient();
        if (redis && redisService.isRedisAvailable()) {
          await redis.set(`${SNAPSHOT_PREFIX}${videoId}`, '1');
        }
        console.log(`✅ [ThumbnailGenerator] Generated snapshot: ${pngPath}`);
        return getSnapshotUrl(videoId);
      }
    } catch (error: any) {
      console.error(`❌ [ThumbnailGenerator] PNG generation failed: ${error.message}`);
      return null;
    }

    return null;
  } catch (error: any) {
    console.error(`❌ [ThumbnailGenerator] Error generating thumbnail for ${videoId}:`, error.message);
    return null;
  }
}

/**
 * Generate thumbnails for multiple videos in parallel (non-blocking)
 */
export async function generateThumbnailsBatch(videos: Array<{ id: string; filename: string; file_path?: string }>): Promise<void> {
  // Filter videos that don't have snapshots yet
  const videosNeedingSnapshots: Array<{ id: string; filename: string; filePath: string }> = [];
  
  for (const video of videos) {
    const videoId = video.id || video.filename;
    const snapshotExists = await hasSnapshot(videoId);
    
    if (!snapshotExists) {
      // Determine video file path
      let videoPath: string;
      if (video.file_path) {
        // If file_path is relative, resolve it
        if (path.isAbsolute(video.file_path)) {
          videoPath = video.file_path;
        } else {
          // Remove 'videos/' prefix if present
          const cleanPath = video.file_path.replace(/^videos[\\\/]/, '');
          videoPath = path.join(projectRoot, 'data', 'videos', cleanPath);
        }
      } else {
        videoPath = path.join(projectRoot, 'data', 'videos', video.filename);
      }
      
      // Check if video file exists
      if (fs.existsSync(videoPath)) {
        videosNeedingSnapshots.push({ id: videoId, filename: video.filename, filePath: videoPath });
      }
    }
  }

  if (videosNeedingSnapshots.length === 0) {
    console.log(`✅ [ThumbnailGenerator] All videos already have snapshots`);
    return;
  }

  console.log(`📸 [ThumbnailGenerator] Generating ${videosNeedingSnapshots.length} snapshots in background...`);

  // Generate snapshots in parallel (but limit concurrency to avoid overwhelming system)
  const CONCURRENCY = 3; // Generate 3 at a time
  for (let i = 0; i < videosNeedingSnapshots.length; i += CONCURRENCY) {
    const batch = videosNeedingSnapshots.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (video) => {
        try {
          await generateThumbnail(video.filePath, video.id);
        } catch (error: any) {
          console.error(`❌ [ThumbnailGenerator] Failed to generate snapshot for ${video.id}:`, error.message);
        }
      })
    );
  }

  console.log(`✅ [ThumbnailGenerator] Completed generating ${videosNeedingSnapshots.length} snapshots`);
}

