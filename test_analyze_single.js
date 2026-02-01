/**
 * Test script to analyze a single video
 * Useful for testing before running the full batch
 */

const { analyzeVideo, callGeminiVideo } = require('./analyze_videos');
const fs = require('fs');
const path = require('path');

const LIBRARY_PATH = path.join(__dirname, 'server/data/videos/library.json');

async function main() {
  // Read library
  const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  const unanalyzed = library.videos.filter(v => !v.analysis);
  
  if (unanalyzed.length === 0) {
    console.log('✅ All videos are already analyzed!');
    return;
  }

  // Get first unanalyzed video
  const testVideo = unanalyzed[0];
  console.log(`🧪 Testing analysis on: ${testVideo.filename}`);
  console.log(`   ID: ${testVideo.id}\n`);

  try {
    const analysis = await analyzeVideo(testVideo);
    
    if (analysis) {
      console.log('\n✅ Test successful! Analysis result:');
      console.log(JSON.stringify(analysis, null, 2));
      
      // Ask if user wants to save
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        rl.question('\nSave this analysis to library.json? (yes/no): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() === 'yes') {
        const videoIndex = library.videos.findIndex(v => v.id === testVideo.id);
        if (videoIndex !== -1) {
          library.videos[videoIndex].analysis = analysis;
          library.videos[videoIndex].analyzed_at = new Date().toISOString();
          library.videos[videoIndex].updated_at = new Date().toISOString();
          library.videos[videoIndex].is_new = false;
          library.metadata.last_updated = new Date().toISOString();
          
          fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2));
          console.log('✅ Analysis saved to library.json');
        }
      }
    } else {
      console.log('❌ Analysis failed - returned null');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

