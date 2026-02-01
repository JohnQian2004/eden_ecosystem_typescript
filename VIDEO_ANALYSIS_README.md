# Video Analysis Setup Guide

This guide explains how to analyze the 110 unanalyzed videos in your library.

## Prerequisites

1. **Google Gemini API Key** - Already configured in the script
   - The script uses the hardcoded Gemini API key from the backend: `AIzaSyBQuKQ0Sgu6fzPUUMYzuGoHRzNeZbv1ixQ`
   - No additional setup needed - the key is already in the codebase
   - Gemini can analyze videos directly without frame extraction!

## Quick Start

### Option 1: Analyze All Videos (Recommended for Batch Processing)

```bash
node analyze_videos.js
```

This will:
- Find all 110 unanalyzed videos
- Ask for confirmation
- Send videos directly to Gemini API for analysis (no frame extraction needed!)
- Update `library.json` after each successful analysis
- Show progress and summary

**Note**: This will make 110 API calls (one per video). Gemini analyzes the entire video, providing more comprehensive results than frame-by-frame analysis.

### Option 2: Analyze Specific Videos

You can modify the script to analyze specific videos by ID or filename.

### Option 3: Analyze in Smaller Batches

To avoid overwhelming the API, you can:
1. Run the script
2. When prompted, analyze a subset
3. Stop the script (Ctrl+C)
4. Run again to continue with remaining videos

## Cost Estimation

- Google Gemini API: Free tier available, then pay-as-you-go
- 110 videos = 110 API calls
- Gemini's video analysis is more efficient than frame extraction
- Check current Gemini pricing at https://ai.google.dev/pricing

## What Gets Analyzed

For each video, the script extracts and analyzes:
- **Content Tags**: Descriptive tags (e.g., "fashion", "urban", "portrait")
- **Detected Objects**: Objects in the scene
- **Shot Type**: close-up, medium, wide, extreme-wide
- **Camera Movement**: static, pan, zoom, tracking, dolly
- **Camera Angle**: eye-level, high-angle, low-angle, bird-eye
- **Lighting**: brightness and temperature
- **Time of Day**: dawn, day, dusk, night
- **Scene Type**: indoor, outdoor, nature, urban, etc.
- **Main Subject**: Description of primary focus
- **Activity**: What's happening in the scene
- **Environment**: Detailed setting description
- **Mood**: Emotional tone and atmosphere

## Output

Results are saved directly to `server/data/videos/library.json` after each successful analysis, so you can stop and resume anytime.

## Troubleshooting

### API Errors
- Check your Gemini API key (already hardcoded in script)
- The script includes rate limiting (1 second between videos)
- If you get model errors, the script will try multiple Gemini models automatically

### Video file not found
- Ensure video files exist in `server/data/videos/`
- Check file paths in `library.json`

## Alternative: Manual Analysis

If you prefer not to use automated analysis, you can manually add analysis data to videos in `library.json` following the structure of the 3 already-analyzed videos.

