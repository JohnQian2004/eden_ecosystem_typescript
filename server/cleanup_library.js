/**
 * Cleanup library.json - Remove entries for video files that don't exist on disk
 */

const fs = require('fs');
const path = require('path');

const serverDir = __dirname;
const libraryPath = path.join(serverDir, 'data', 'videos', 'library.json');
const videosDir = path.join(serverDir, 'data', 'videos');

console.log('🧹 Cleaning up library.json...');
console.log(`   Library path: ${libraryPath}`);
console.log(`   Videos dir: ${videosDir}`);

if (!fs.existsSync(libraryPath)) {
  console.error(`❌ Library file not found: ${libraryPath}`);
  process.exit(1);
}

if (!fs.existsSync(videosDir)) {
  console.error(`❌ Videos directory not found: ${videosDir}`);
  process.exit(1);
}

// Read library.json
let library;
try {
  const content = fs.readFileSync(libraryPath, 'utf-8');
  library = JSON.parse(content);
  console.log(`✅ Loaded library.json with ${library.videos?.length || 0} entries`);
} catch (error) {
  console.error(`❌ Error reading library.json: ${error.message}`);
  process.exit(1);
}

// Get list of actual video files on disk
const actualFiles = new Set();
try {
  const files = fs.readdirSync(videosDir);
  files.forEach(file => {
    if (file.toLowerCase().endsWith('.mp4') || 
        file.toLowerCase().endsWith('.mov') ||
        file.toLowerCase().endsWith('.avi') ||
        file.toLowerCase().endsWith('.mkv')) {
      actualFiles.add(file);
    }
  });
  console.log(`✅ Found ${actualFiles.size} video files on disk`);
} catch (error) {
  console.error(`❌ Error reading videos directory: ${error.message}`);
  process.exit(1);
}

// Filter library to only include videos that exist
const originalCount = library.videos?.length || 0;
const cleanedVideos = (library.videos || []).filter(video => {
  const exists = actualFiles.has(video.filename);
  if (!exists) {
    console.log(`   ⚠️  Removing entry for non-existent file: ${video.filename}`);
  }
  return exists;
});

const removedCount = originalCount - cleanedVideos.length;

if (removedCount > 0) {
  // Update library
  library.videos = cleanedVideos;
  library.last_cleaned = new Date().toISOString();
  
  // Write back to file
  try {
    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2), 'utf-8');
    console.log(`✅ Cleaned library.json: Removed ${removedCount} entries (${originalCount} → ${cleanedVideos.length})`);
  } catch (error) {
    console.error(`❌ Error writing library.json: ${error.message}`);
    process.exit(1);
  }
} else {
  console.log(`✅ No cleanup needed - all ${originalCount} entries correspond to existing files`);
}

// Also check for files on disk that aren't in library.json
const libraryFilenames = new Set(cleanedVideos.map(v => v.filename));
const missingFromLibrary = Array.from(actualFiles).filter(file => !libraryFilenames.has(file));
if (missingFromLibrary.length > 0) {
  console.log(`\n⚠️  Found ${missingFromLibrary.length} video file(s) on disk that aren't in library.json:`);
  missingFromLibrary.forEach(file => {
    console.log(`   - ${file}`);
  });
  console.log(`   (These files will be added when you sync the library)`);
}

console.log('\n✅ Cleanup complete!');

