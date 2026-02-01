/**
 * Video Analysis Script
 * Analyzes unanalyzed videos in the library.json file
 * Uses Google Gemini API for direct video analysis (no frame extraction needed)
 */

const fs = require('fs');
const path = require('path');

const LIBRARY_PATH = path.join(__dirname, 'server/data/videos/library.json');
const VIDEOS_DIR = path.join(__dirname, 'server/data/videos');
// Hardcoded Gemini API key from backend
const GEMINI_API_KEY = 'AIzaSyBQuKQ0Sgu6fzPUUMYzuGoHRzNeZbv1ixQ';

// List available Gemini models
async function listAvailableGeminiModels() {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
    const response = await fetch(listUrl, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const models = data.models || [];
    return models
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name);
  } catch (error) {
    console.warn(`Failed to list Gemini models: ${error.message}`);
    return [];
  }
}

// Call Gemini API for direct video analysis
async function callGeminiVideo(prompt, videoBase64, mimeType) {
  // List available models first
  const availableModels = await listAvailableGeminiModels();
  
  // Build list of models to try (prioritize video-capable models)
  const modelsToTry = [];
  
  // Add available models first
  for (const modelName of availableModels) {
    const name = modelName.replace('models/', '');
    modelsToTry.push({ version: 'v1beta', name: modelName });
    modelsToTry.push({ version: 'v1beta', name });
    modelsToTry.push({ version: 'v1', name: modelName });
    modelsToTry.push({ version: 'v1', name });
  }
  
  // Add fallback models (video-capable Gemini models)
  if (modelsToTry.length === 0) {
    modelsToTry.push(
      { version: 'v1beta', name: 'gemini-2.0-flash-exp' },
      { version: 'v1beta', name: 'gemini-1.5-pro' },
      { version: 'v1beta', name: 'gemini-1.5-flash' },
      { version: 'v1', name: 'gemini-1.5-pro' },
      { version: 'v1', name: 'gemini-1.5-flash' }
    );
  }

  const requestPayload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: videoBase64,
            },
          },
        ],
      },
    ],
  };

  let lastError = null;

  for (const modelConfig of modelsToTry) {
    const modelName = modelConfig.name.startsWith('models/') 
      ? modelConfig.name 
      : `models/${modelConfig.name}`;
    const apiUrl = `https://generativelanguage.googleapis.com/${modelConfig.version}/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
      console.log(`   🔵 Trying model: ${modelConfig.name} (${modelConfig.version})`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 400) {
          console.warn(`   ⚠️  Model ${modelConfig.name} not available, trying next...`);
          continue;
        }
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (text) {
        console.log(`   ✅ Success with model: ${modelConfig.name}`);
        return text;
      } else {
        console.warn('   ⚠️  Gemini returned empty response');
      }
    } catch (error) {
      lastError = error;
      if (error.message.includes('404') || error.message.includes('400')) {
        continue;
      }
      break;
    }
  }

  throw new Error(`Failed to call Gemini: ${lastError?.message || 'All models failed'}`);
}

// Analyze video directly with Gemini API (no frame extraction needed)
async function analyzeVideo(video) {
  console.log(`\n🎬 Analyzing: ${video.filename}`);
  console.log(`   ID: ${video.id}`);
  
  const videoPath = video.file_path;
  const fullVideoPath = path.join(VIDEOS_DIR, videoPath.replace(/^videos[\\\/]/, ''));
  
  if (!fs.existsSync(fullVideoPath)) {
    console.error(`   ❌ Video file not found: ${fullVideoPath}`);
    return null;
  }

  try {
    // Read video file and convert to base64
    console.log('   📹 Reading video file...');
    const videoBuffer = fs.readFileSync(fullVideoPath);
    const videoBase64 = videoBuffer.toString('base64');
    const fileSizeMB = (videoBase64.length * 3 / 4 / 1024 / 1024).toFixed(2);
    
    // Get MIME type from file extension
    const ext = path.extname(video.filename).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
    };
    const mimeType = mimeTypes[ext] || 'video/mp4';
    
    console.log(`   📊 Video size: ~${fileSizeMB} MB (base64 encoded)`);
    console.log(`   📋 MIME type: ${mimeType}`);

    // Enhanced analysis prompt (same as backend)
    const analysisPrompt = `Analyze this video in detail. Watch the video carefully and describe what you see throughout the entire duration.

CONTENT ANALYSIS (most important - describe what is actually in the video in DETAIL):
1. Main Subject: What is the primary focus throughout the video? (person, object, scene, animal, etc.) - Be very specific
2. Activity: What is happening? What are people doing? (walking, talking, sitting, dancing, cooking, working, etc.) - Describe actions in detail
3. Objects: List ALL visible objects in detail (vehicles, buildings, furniture, electronics, nature, clothing, accessories, etc.)
4. Environment: Describe the setting in detail (street, room, park, beach, office, kitchen, etc.) - Include architectural details, weather, time period
5. People: How many people? Detailed description of each person (age, gender, appearance, clothing, expressions, body language, what they're doing)
6. Mood/Atmosphere: What feeling does this video convey? (happy, serious, calm, energetic, etc.) - Be specific about emotional tone
7. Video Progression: Describe in detail any changes, movements, or progression throughout the video - second by second if significant
8. Colors: Describe the color palette, dominant colors, color temperature
9. Composition: Describe the visual composition, framing, rule of thirds, visual balance
10. Details: Any small details, text visible, brands, logos, signs, etc.

TECHNICAL ANALYSIS (be very specific):
- Scene type: indoor/outdoor/nature/urban/industrial/residential/commercial - be specific
- Shot type: extreme-close-up/close-up/medium/wide/extreme-wide/aerial - be precise
- Camera angle: eye-level/high-angle/low-angle/bird-eye/dutch-angle - describe the angle
- Camera movement: static/pan-left/pan-right/tilt-up/tilt-down/zoom-in/zoom-out/tracking/dolly/steady-cam/handheld - describe movement
- Lighting brightness: very-dark/dark/dim/normal/bright/very-bright - be specific
- Lighting temperature: very-warm/warm/neutral/cool/very-cool - describe color temperature
- Lighting quality: hard/soft/diffused/dramatic/natural/artificial - describe lighting style
- Time of day: dawn/sunrise/morning/day/afternoon/dusk/sunset/night/midnight - be specific
- Video quality: resolution estimate, stability (stable/shaky), focus (sharp/soft/blurry), grain/noise level
- Frame rate: smooth/jerky/normal
- Depth of field: shallow/deep/mixed

STYLE AND AESTHETICS:
- Visual style: cinematic/documentary/amateur/professional/vintage/modern
- Genre indicators: what type of content this could be (vlog, commercial, movie, documentary, etc.)
- Production value: high/medium/low

IMPORTANT: Respond with ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object. Include as much detail as possible.

For main_subject, activity, environment, and mood, provide them as JSON objects with a "description" field containing the detailed text:
{
  "scene_type": "outdoor",
  "shot_type": "close-up",
  "camera_angle": "eye-level",
  "camera_movement": "static",
  "lighting_brightness": "normal",
  "lighting_temperature": "neutral",
  "lighting_quality": "soft",
  "time_of_day": "day",
  "detected_objects": ["person", "phone", "street", "building", "car", "tree"],
  "content_tags": ["walking", "urban", "casual", "daylight", "person", "technology"],
  "main_subject": {
    "description": "detailed description of main subject"
  },
  "activity": {
    "description": "detailed description of what is happening"
  },
  "environment": {
    "description": "detailed description of the setting"
  },
  "people": [{"count": 1, "description": "detailed person description", "age_estimate": "20s", "gender": "female", "clothing": "casual", "expression": "smiling"}],
  "mood": {
    "description": "detailed description of the mood and atmosphere"
  },
  "video_progression": "detailed second-by-second description of changes",
  "colors": ["dominant colors in the video"],
  "composition": "description of visual composition",
  "details": ["any small details, text, brands visible"],
  "visual_style": "cinematic",
  "production_value": "high",
  "genre_indicators": ["vlog", "lifestyle"],
  "depth_of_field": "shallow",
  "video_quality": "high resolution, stable, sharp focus"
}`;

    // Call Gemini API with video
    console.log('   🔵 Sending video to Gemini API for analysis...');
    const aiResponse = await callGeminiVideo(analysisPrompt, videoBase64, mimeType);
    console.log(`   ✅ Received response from Gemini (${aiResponse.length} chars)`);

    // Parse JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('   ❌ Could not extract JSON from Gemini response');
      return null;
    }

    try {
      const parsedData = JSON.parse(jsonMatch[0]);
      
      // Normalize content description fields to JSON objects
      const normalizeContentField = (value) => {
        if (!value) return undefined;
        if (typeof value === 'object' && value !== null) {
          if (value.description) {
            return value;
          }
          const text = value.text || value.value || JSON.stringify(value);
          return { description: text, ...value };
        }
        return { description: String(value) };
      };
      
      // Build analysis object matching the library.json structure
      const analysis = {
        content_tags: Array.isArray(parsedData.content_tags) ? parsedData.content_tags : [],
        detected_objects: Array.isArray(parsedData.detected_objects) ? parsedData.detected_objects : [],
        shot_type: parsedData.shot_type || parsedData.shotType || 'medium',
        camera_movement: parsedData.camera_movement || parsedData.cameraMovement || 'static',
        camera_angle: parsedData.camera_angle || parsedData.cameraAngle || 'eye-level',
        lighting_brightness: parsedData.lighting_brightness || parsedData.lightingBrightness || 'normal',
        lighting_temperature: parsedData.lighting_temperature || parsedData.lightingTemperature || 'neutral',
        time_of_day: parsedData.time_of_day || parsedData.timeOfDay || 'day',
        scene_type: parsedData.scene_type || parsedData.sceneType || 'outdoor',
        main_subject: normalizeContentField(parsedData.main_subject || parsedData.mainSubject),
        activity: normalizeContentField(parsedData.activity),
        environment: normalizeContentField(parsedData.environment),
        mood: normalizeContentField(parsedData.mood || parsedData.mood_atmosphere),
        analysis_metadata: {
          lighting_quality: parsedData.lighting_quality || parsedData.lightingQuality || '',
          video_progression: parsedData.video_progression || parsedData.videoProgression || parsedData.progression || '',
          colors: parsedData.colors || parsedData.color_palette || parsedData.colorPalette || [],
          composition: parsedData.composition || parsedData.composition_description || '',
          details: parsedData.details || parsedData.details_list || [],
          visual_style: parsedData.visual_style || parsedData.visualStyle || '',
          production_value: parsedData.production_value || parsedData.productionValue || '',
          genre_indicators: parsedData.genre_indicators || parsedData.genreIndicators || [],
          depth_of_field: parsedData.depth_of_field || parsedData.depthOfField || '',
          video_quality: parsedData.video_quality || parsedData.videoQuality || '',
          people: parsedData.people || parsedData.people_list || [],
          raw_analysis: aiResponse,
        },
        analyzed_at: new Date().toISOString(),
      };

      console.log(`   ✅ Analysis complete! Tags: ${analysis.content_tags.length}, Objects: ${analysis.detected_objects.length}`);
      return analysis;

    } catch (parseError) {
      console.error(`   ❌ Failed to parse JSON from Gemini response: ${parseError.message}`);
      console.error(`   Response preview: ${aiResponse.substring(0, 500)}`);
      return null;
    }

  } catch (error) {
    console.error(`   ❌ Error analyzing video: ${error.message}`);
    return null;
  }
}


// Main function
async function main() {
  console.log('🎬 Video Analysis Script');
  console.log('='.repeat(60));
  
  // Read library
  if (!fs.existsSync(LIBRARY_PATH)) {
    console.error(`❌ Library file not found: ${LIBRARY_PATH}`);
    process.exit(1);
  }

  const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  const unanalyzed = library.videos.filter(v => !v.analysis);
  
  console.log(`\n📊 Found ${unanalyzed.length} unanalyzed videos out of ${library.videos.length} total`);
  
  if (unanalyzed.length === 0) {
    console.log('✅ All videos are already analyzed!');
    return;
  }

  // Ask for confirmation
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    rl.question(`\nDo you want to analyze all ${unanalyzed.length} videos? (yes/no): `, resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('Analysis cancelled.');
    return;
  }

  // Process videos
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < unanalyzed.length; i++) {
    const video = unanalyzed[i];
    console.log(`\n[${i + 1}/${unanalyzed.length}]`);
    
    try {
      const analysis = await analyzeVideo(video);
      
      if (analysis) {
        // Update video in library
        const videoIndex = library.videos.findIndex(v => v.id === video.id);
        if (videoIndex !== -1) {
          library.videos[videoIndex].analysis = analysis;
          library.videos[videoIndex].analyzed_at = new Date().toISOString();
          library.videos[videoIndex].updated_at = new Date().toISOString();
          library.videos[videoIndex].is_new = false;
          
          // Save after each successful analysis
          library.metadata.last_updated = new Date().toISOString();
          library.metadata.total_videos = library.videos.length;
          fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2));
          
          results.success++;
        }
      } else {
        results.failed++;
        results.errors.push({ video: video.filename, error: 'Analysis returned null' });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({ video: video.filename, error: error.message });
      console.error(`   ❌ Failed: ${error.message}`);
    }

    // Rate limiting - wait 1 second between videos
    if (i < unanalyzed.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Analysis Summary:');
  console.log(`   ✅ Success: ${results.success}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(({ video, error }) => {
      console.log(`   - ${video}: ${error}`);
    });
  }
  
  console.log('\n✅ Analysis complete!');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { analyzeVideo, callGeminiVideo };

