/**
 * Media Migration Script
 * Migrates videos and images from the main server to the media server
 */

import * as fs from 'fs';
import * as path from 'path';
import { MediaServer } from '../mediaServer';

// Determine project root
let projectRoot = __dirname;
const normalizedDir = projectRoot.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src/scripts')) {
  projectRoot = path.dirname(path.dirname(projectRoot));
} else if (normalizedDir.endsWith('/dist/src/scripts')) {
  projectRoot = path.dirname(path.dirname(path.dirname(projectRoot)));
}

async function migrateVideos(sourceServerPath?: string): Promise<void> {
  console.log('🚀 [MediaMigration] Starting video migration...');
  
  const mediaServer = new MediaServer();
  
  // First, scan and register existing files in media-server/data/videos
  // (since videos are already in data/videos, we just need to register them)
  console.log('📂 [MediaMigration] Scanning existing files in media-server/data/videos...');
  const scanned = mediaServer.scanAndRegisterExistingFiles();
  if (scanned.videos > 0) {
    console.log(`✅ [MediaMigration] Registered ${scanned.videos} existing videos from data/videos`);
  }
  
  // Migrate from library.json if it exists (from main server)
  const migrated = await mediaServer.migrateVideosFromLibrary(sourceServerPath);
  console.log(`✅ [MediaMigration] Migrated ${migrated} videos from library.json`);

  // Also migrate any video files directly in the source directory (if different from media-server)
  let sourceVideosDir: string;
  if (sourceServerPath) {
    sourceVideosDir = path.join(sourceServerPath, 'data', 'videos');
  } else {
    const parentDir = path.dirname(projectRoot);
    sourceVideosDir = path.join(parentDir, 'server', 'data', 'videos');
  }

  // Only migrate if source is different from media-server's data/videos
  const mediaServerVideosDir = path.join(projectRoot, 'data', 'videos');
  if (fs.existsSync(sourceVideosDir) && path.resolve(sourceVideosDir) !== path.resolve(mediaServerVideosDir)) {
    const videoFiles = fs.readdirSync(sourceVideosDir).filter(f => 
      ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(path.extname(f).toLowerCase())
    );

    let directMigrated = 0;
    for (const filename of videoFiles) {
      const sourcePath = path.join(sourceVideosDir, filename);
      const existing = mediaServer.getAllMediaFiles('video').find(m => m.filename === filename);
      
      // Only migrate if not already registered
      if (!existing) {
        try {
          mediaServer.registerMediaFile(filename, 'video', sourcePath);
          directMigrated++;
        } catch (error) {
          console.error(`❌ [MediaMigration] Failed to migrate ${filename}:`, error);
        }
      }
    }

    if (directMigrated > 0) {
      console.log(`✅ [MediaMigration] Migrated ${directMigrated} additional video files from source`);
    }
  }

  console.log('✅ [MediaMigration] Video migration complete!');
}

async function migrateImages(sourceServerPath?: string): Promise<void> {
  console.log('🚀 [MediaMigration] Starting image migration...');
  
  const mediaServer = new MediaServer();
  
  // First, scan and register existing files in media-server/data/images
  // (since images are already in data/images, we just need to register them)
  console.log('📂 [MediaMigration] Scanning existing files in media-server/data/images...');
  const scanned = mediaServer.scanAndRegisterExistingFiles();
  if (scanned.images > 0) {
    console.log(`✅ [MediaMigration] Registered ${scanned.images} existing images from data/images`);
  }
  
  // Look for images in various locations (if different from media-server)
  let possibleImageDirs: string[] = [];
  const mediaServerImagesDir = path.join(projectRoot, 'data', 'images');
  
  if (sourceServerPath) {
    possibleImageDirs = [
      path.join(sourceServerPath, 'data', 'images'),
      path.join(sourceServerPath, 'data', 'thumbnails'),
      path.join(sourceServerPath, 'frontend', 'src', 'assets', 'images'),
    ];
  } else {
    const parentDir = path.dirname(projectRoot);
    possibleImageDirs = [
      path.join(parentDir, 'server', 'data', 'images'),
      path.join(parentDir, 'server', 'data', 'thumbnails'),
      path.join(parentDir, 'frontend', 'src', 'assets', 'images'),
    ];
  }

  let totalMigrated = 0;
  
  for (const imageDir of possibleImageDirs) {
    if (!fs.existsSync(imageDir)) {
      continue;
    }

    // Skip if this is the same as media-server's data/images (already scanned)
    if (path.resolve(imageDir) === path.resolve(mediaServerImagesDir)) {
      continue;
    }

    const imageFiles = fs.readdirSync(imageDir).filter(f => 
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(path.extname(f).toLowerCase())
    );

    for (const filename of imageFiles) {
      const sourcePath = path.join(imageDir, filename);
      const existing = mediaServer.getAllMediaFiles('image').find(m => m.filename === filename);
      
      // Only migrate if not already registered
      if (!existing) {
        try {
          mediaServer.registerMediaFile(filename, 'image', sourcePath);
          totalMigrated++;
        } catch (error) {
          console.error(`❌ [MediaMigration] Failed to migrate ${filename}:`, error);
        }
      }
    }
  }

  if (totalMigrated > 0) {
    console.log(`✅ [MediaMigration] Migrated ${totalMigrated} additional image files from source`);
  } else {
    console.log(`ℹ️ [MediaMigration] No additional images found to migrate`);
  }

  console.log('✅ [MediaMigration] Image migration complete!');
}

/**
 * Run full migration
 */
export async function runMigration(sourceServerPath?: string): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📦 [MediaMigration] Starting Media Server Migration');
  console.log('═══════════════════════════════════════════════════════════');
  
  await migrateVideos(sourceServerPath);
  await migrateImages(sourceServerPath);
  
  const mediaServer = new MediaServer();
  const allMedia = mediaServer.getAllMediaFiles();
  console.log(`\n✅ [MediaMigration] Migration complete! Total media files: ${allMedia.length}`);
  console.log(`   - Videos: ${allMedia.filter(m => m.type === 'video').length}`);
  console.log(`   - Images: ${allMedia.filter(m => m.type === 'image').length}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run migration if called directly
if (require.main === module) {
  const sourcePath = process.argv[2]; // Optional source server path
  runMigration(sourcePath).catch(console.error);
}

