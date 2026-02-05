/**
 * Migration script: Move library.json data to Redis
 * Run this once to migrate all existing video data from library.json to Redis
 */

import * as fs from 'fs';
import * as path from 'path';
import * as videoLibraryRedis from '../services/videoLibraryRedisService';
import { initRedis } from '../services/redisService';

// Determine project root
let projectRoot = __dirname;
const normalizedDir = projectRoot.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src/scripts')) {
  projectRoot = path.dirname(path.dirname(projectRoot));
} else if (normalizedDir.endsWith('/dist/src/scripts')) {
  projectRoot = path.dirname(path.dirname(path.dirname(projectRoot)));
}

const MEDIA_BASE_DIR = path.join(projectRoot, 'data');
const LIBRARY_JSON_PATH = path.join(MEDIA_BASE_DIR, 'library.json');

async function migrateLibraryToRedis(): Promise<void> {
  console.log('🔄 [Migration] Starting library.json to Redis migration...');
  
  // Initialize Redis
  try {
    await initRedis();
    console.log('✅ [Migration] Redis initialized');
  } catch (error: any) {
    console.error('❌ [Migration] Failed to initialize Redis:', error.message);
    process.exit(1);
  }

  // Check if library.json exists
  if (!fs.existsSync(LIBRARY_JSON_PATH)) {
    console.log(`⚠️ [Migration] library.json not found at ${LIBRARY_JSON_PATH}`);
    console.log('✅ [Migration] No migration needed - Redis is ready for new videos');
    return;
  }

  // Load library.json
  let library: any = null;
  try {
    const libraryContent = fs.readFileSync(LIBRARY_JSON_PATH, 'utf-8');
    library = JSON.parse(libraryContent);
    console.log(`📚 [Migration] Loaded library.json with ${library.videos?.length || 0} videos`);
  } catch (error: any) {
    console.error(`❌ [Migration] Failed to parse library.json:`, error.message);
    process.exit(1);
  }

  if (!library.videos || library.videos.length === 0) {
    console.log('⚠️ [Migration] No videos found in library.json');
    console.log('✅ [Migration] Migration complete (no videos to migrate)');
    return;
  }

  // Migrate each video to Redis
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`🔄 [Migration] Migrating ${library.videos.length} videos to Redis...`);

  for (const video of library.videos) {
    try {
      const videoId = video.id || video.filename;
      if (!videoId) {
        console.warn(`⚠️ [Migration] Skipping video without id or filename:`, video);
        skipped++;
        continue;
      }

      // Check if video already exists in Redis
      const exists = await videoLibraryRedis.videoExists(videoId);
      if (exists) {
        console.log(`⏭️  [Migration] Video ${videoId} already exists in Redis, skipping`);
        skipped++;
        continue;
      }

      // Save video to Redis
      const success = await videoLibraryRedis.saveVideo(video);
      if (success) {
        migrated++;
        if (migrated % 100 === 0) {
          console.log(`📊 [Migration] Progress: ${migrated}/${library.videos.length} videos migrated...`);
        }
      } else {
        console.error(`❌ [Migration] Failed to save video ${videoId}`);
        errors++;
      }
    } catch (error: any) {
      console.error(`❌ [Migration] Error migrating video:`, error.message);
      errors++;
    }
  }

  // Summary
  console.log('\n📊 [Migration] Migration Summary:');
  console.log(`   ✅ Migrated: ${migrated} videos`);
  console.log(`   ⏭️  Skipped: ${skipped} videos (already in Redis)`);
  console.log(`   ❌ Errors: ${errors} videos`);
  console.log(`   📚 Total in library.json: ${library.videos.length} videos`);

  const totalInRedis = await videoLibraryRedis.getVideoCount();
  console.log(`   📦 Total in Redis: ${totalInRedis} videos`);

  if (errors === 0) {
    console.log('\n✅ [Migration] Migration completed successfully!');
    console.log('💡 [Migration] You can now use Redis for video storage.');
    console.log('💡 [Migration] library.json will be used as fallback if Redis is unavailable.');
  } else {
    console.log(`\n⚠️ [Migration] Migration completed with ${errors} errors.`);
    console.log('💡 [Migration] Check the logs above for details.');
  }
}

// Run migration
if (require.main === module) {
  migrateLibraryToRedis()
    .then(() => {
      console.log('✅ [Migration] Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ [Migration] Script failed:', error);
      process.exit(1);
    });
}

export { migrateLibraryToRedis };

