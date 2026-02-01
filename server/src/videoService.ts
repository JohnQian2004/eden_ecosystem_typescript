/**
 * Video Service - Lists all videos from server/data/videos directory
 * All movies are FREE and users get 1 APPLE reward when they watch a movie
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MovieListing } from './types';

// Determine the correct path to server/data/videos
// When running with ts-node, __dirname is server/src
// We need to go up one level to server/, then into data/videos
let serverDir = __dirname;
// Check if we're in server/src or server/dist/src
const normalizedDir = serverDir.replace(/\\/g, '/'); // Normalize to forward slashes for checking
if (normalizedDir.endsWith('/src')) {
  // We're in server/src, go up one level to server/
  serverDir = path.dirname(serverDir);
} else if (normalizedDir.endsWith('/dist/src')) {
  // We're in server/dist/src (compiled), go up two levels to server/
  serverDir = path.dirname(path.dirname(serverDir));
}
// Verify we found the server directory by checking for data/videos
const testVideosPath = path.join(serverDir, 'data', 'videos');
if (!fs.existsSync(testVideosPath)) {
  // If not found, try going up one more level (in case __dirname structure is different)
  const parentDir = path.dirname(serverDir);
  const parentVideosPath = path.join(parentDir, 'data', 'videos');
  if (fs.existsSync(parentVideosPath)) {
    serverDir = parentDir;
  }
}

const VIDEOS_DIR = path.join(serverDir, 'data', 'videos');
const LIBRARY_JSON = path.join(serverDir, 'data', 'videos', 'library.json');

/**
 * Get all video files from the videos directory
 */
export function getAllVideoFiles(): string[] {
  try {
    if (!fs.existsSync(VIDEOS_DIR)) {
      console.warn(`⚠️ [VideoService] Videos directory not found: ${VIDEOS_DIR}`);
      return [];
    }
    
    const files = fs.readdirSync(VIDEOS_DIR);
    const videoFiles = files.filter(file => 
      file.toLowerCase().endsWith('.mp4') || 
      file.toLowerCase().endsWith('.mov') ||
      file.toLowerCase().endsWith('.avi') ||
      file.toLowerCase().endsWith('.mkv')
    );
    
    console.log(`🎬 [VideoService] Found ${videoFiles.length} video files in ${VIDEOS_DIR}`);
    return videoFiles;
  } catch (error: any) {
    console.error(`❌ [VideoService] Error reading videos directory:`, error.message);
    return [];
  }
}

/**
 * Load video library from library.json
 */
function loadVideoLibrary(): any {
  try {
    if (!fs.existsSync(LIBRARY_JSON)) {
      console.warn(`⚠️ [VideoService] Library file not found: ${LIBRARY_JSON}`);
      console.warn(`   Current __dirname: ${__dirname}`);
      console.warn(`   Resolved path: ${LIBRARY_JSON}`);
      return { videos: [] };
    }
    
    const content = fs.readFileSync(LIBRARY_JSON, 'utf-8');
    const library = JSON.parse(content);
    console.log(`✅ [VideoService] Loaded ${library.videos?.length || 0} videos from library.json`);
    return library;
  } catch (error: any) {
    console.error(`❌ [VideoService] Error loading library.json:`, error.message);
    console.error(`   Path attempted: ${LIBRARY_JSON}`);
    return { videos: [] };
  }
}

/**
 * Check if a video matches genre filter based on content_tags
 */
function matchesGenre(video: any, genre?: string): boolean {
  if (!genre) return true;
  
  const genreLower = genre.toLowerCase();
  const genreVariants = [
    genreLower,
    genreLower.replace(/[^a-z0-9]/g, ''), // Remove hyphens/spaces: "sci-fi" -> "scifi"
    genreLower.replace(/-/g, ' '), // Replace hyphens with spaces: "sci-fi" -> "sci fi"
  ];
  
  // Check content_tags
  const contentTags = (video.analysis?.content_tags || []).map((tag: string) => tag.toLowerCase());
  const genreIndicators = (video.analysis?.analysis_metadata?.genre_indicators || []).map((ind: string) => ind.toLowerCase());
  
  // Check if any content tag or genre indicator matches
  const allTags = [...contentTags, ...genreIndicators];
  return genreVariants.some(variant => 
    allTags.some(tag => tag.includes(variant) || variant.includes(tag))
  );
}

/**
 * Convert video filename to a movie title
 */
function videoFilenameToTitle(filename: string): string {
  // Remove extension
  let title = filename.replace(/\.(mp4|mov|avi|mkv)$/i, '');
  
  // Remove common prefixes
  title = title.replace(/^(vibes_media_|downloaded_video_)/i, '');
  
  // Replace underscores and hyphens with spaces
  title = title.replace(/[_-]/g, ' ');
  
  // Capitalize first letter of each word
  title = title.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return title || filename;
}

/**
 * Get all movies as listings - all FREE (price = 0)
 * Optionally filter by genre using content_tags from library.json
 */
export function getAllMoviesAsListings(
  providerId: string, 
  providerName: string, 
  gardenId: string,
  filters?: { genre?: string }
): MovieListing[] {
  // Load library.json to get analysis data (content_tags for genre filtering)
  const library = loadVideoLibrary();
  const libraryVideos = library.videos || [];
  
  // Create a map of filename -> video data for quick lookup
  const videoMap = new Map<string, any>();
  libraryVideos.forEach((video: any) => {
    videoMap.set(video.filename, video);
  });
  
  // Get all video files that actually exist on disk
  const videoFiles = getAllVideoFiles();
  
  // CRITICAL: Only include files that actually exist on disk
  // Filter out entries from library.json that reference non-existent files
  const existingVideoFiles = videoFiles.filter(filename => {
    const videoFilePath = path.join(VIDEOS_DIR, filename);
    const exists = fs.existsSync(videoFilePath);
    if (!exists) {
      console.log(`   ⚠️ [VideoService] Video file in directory but not found on disk: ${filename}`);
    }
    return exists;
  });
  
  // Filter by genre if specified
  let filteredFiles = existingVideoFiles;
  if (filters?.genre) {
    filteredFiles = existingVideoFiles.filter(filename => {
      const videoData = videoMap.get(filename);
      if (!videoData) return true; // Include if no analysis data
      return matchesGenre(videoData, filters.genre);
    });
    console.log(`🎬 [VideoService] Filtered ${filteredFiles.length} videos by genre "${filters.genre}" (from ${existingVideoFiles.length} total)`);
  }
  
  const listings: MovieListing[] = filteredFiles.map((filename, index) => {
    const videoData = videoMap.get(filename);
    const movieTitle = videoFilenameToTitle(filename);
    const videoUrl = `/api/movie/video/${filename}`;
    const movieId = `movie-${index + 1}-${Date.now()}`;
    
    return {
      id: movieId,
      movieId: movieId,
      providerId: providerId,
      providerName: providerName,
      movieTitle: movieTitle,
      price: 0, // ALL MOVIES ARE FREE
      showtime: "Available Now", // All movies available immediately
      location: "Eden Video Library",
      videoUrl: videoUrl,
      gardenId: gardenId,
      reviewCount: 0,
      rating: 0
    };
  });
  
  console.log(`🎬 [VideoService] Generated ${listings.length} FREE movie listings for provider ${providerId}${filters?.genre ? ` (genre: ${filters.genre})` : ''}`);
  return listings;
}

