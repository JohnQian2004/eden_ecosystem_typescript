/**
 * Media Migration Script
 * Migrates videos and images from old locations to the new media server
 */

import * as fs from 'fs';
import * as path from 'path';
import { mediaServer } from './mediaServer';

// Determine server directory
let serverDir = __dirname;
const normalizedDir = serverDir.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src/media')) {
  serverDir = path.dirname(path.dirname(serverDir));
} else if (normalizedDir.endsWith('/dist/src/media')) {
  serverDir = path.dirname(path.dirname(path.dirname(serverDir)));
}

async function migrateVideos(): Promise<void> {
  console.log('🚀 [MediaMigration] Starting video migration...');
  
  const oldVideosDir = path.join(serverDir, 'data', 'videos');
  const libraryJsonPath = path.join(oldVideosDir, 'library.json');
  
  if (!fs.existsSync(oldVideosDir)) {
    console.log(`⚠️ [MediaMigration] Videos directory not found: ${oldVideosDir}`);
    return;
  }

  // Migrate from library.json if it exists
  if (fs.existsSync(libraryJsonPath)) {
    const migrated = await mediaServer.migrateVideosFromLibrary();
    console.log(`✅ [MediaMigration] Migrated ${migrated} videos from library.json`);
  }

  // Also migrate any video files directly in the directory
  const videoFiles = fs.readdirSync(oldVideosDir).filter(f => 
    ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(path.extname(f).toLowerCase())
  );

  let directMigrated = 0;
  for (const filename of videoFiles) {
    const sourcePath = path.join(oldVideosDir, filename);
    const mediaFile = mediaServer.getMediaFile(filename);
    
    // Only migrate if not already registered
    if (!mediaFile) {
      try {
        mediaServer.registerMediaFile(filename, 'video', sourcePath);
        directMigrated++;
      } catch (error) {
        console.error(`❌ [MediaMigration] Failed to migrate ${filename}:`, error);
      }
    }
  }

  if (directMigrated > 0) {
    console.log(`✅ [MediaMigration] Migrated ${directMigrated} additional video files`);
  }

  console.log('✅ [MediaMigration] Video migration complete!');
}

async function migrateImages(): Promise<void> {
  console.log('🚀 [MediaMigration] Starting image migration...');
  
  // Look for images in various locations
  const possibleImageDirs = [
    path.join(serverDir, 'data', 'images'),
    path.join(serverDir, 'data', 'thumbnails'),
    path.join(serverDir, 'frontend', 'src', 'assets', 'images'),
  ];

  let totalMigrated = 0;
  
  for (const imageDir of possibleImageDirs) {
    if (!fs.existsSync(imageDir)) {
      continue;
    }

    const imageFiles = fs.readdirSync(imageDir).filter(f => 
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(path.extname(f).toLowerCase())
    );

    for (const filename of imageFiles) {
      const sourcePath = path.join(imageDir, filename);
      const mediaFile = mediaServer.getMediaFile(filename);
      
      // Only migrate if not already registered
      if (!mediaFile) {
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
    console.log(`✅ [MediaMigration] Migrated ${totalMigrated} image files`);
  } else {
    console.log(`ℹ️ [MediaMigration] No images found to migrate`);
  }

  console.log('✅ [MediaMigration] Image migration complete!');
}

/**
 * Run full migration
 */
export async function runMigration(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📦 [MediaMigration] Starting Media Server Migration');
  console.log('═══════════════════════════════════════════════════════════');
  
  await migrateVideos();
  await migrateImages();
  
  const allMedia = mediaServer.getAllMediaFiles();
  console.log(`\n✅ [MediaMigration] Migration complete! Total media files: ${allMedia.length}`);
  console.log(`   - Videos: ${allMedia.filter(m => m.type === 'video').length}`);
  console.log(`   - Images: ${allMedia.filter(m => m.type === 'image').length}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run migration if called directly
if (require.main === module) {
  runMigration().catch(console.error);
}

