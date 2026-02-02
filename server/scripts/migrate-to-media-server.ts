/**
 * Migration Script - Migrate all videos/images to Media Server
 * 
 * Run this script to migrate all existing videos and images to the new media server:
 *   npx ts-node scripts/migrate-to-media-server.ts
 */

import { runMigration } from '../src/media/migrateMedia';

runMigration()
  .then(() => {
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });

