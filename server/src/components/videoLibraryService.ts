/**
 * Video Library Service - FlowWise Service Component
 * 
 * This service reads from video-library.json and provides video library operations
 * for FlowWise workflows. It's controlled by the video-library.json file.
 * 
 * ARCHITECTURE:
 * - Reads from server/data/videos/library.json
 * - Provides video listing operations for FlowWise workflows
 * - Can be used as a service provider in workflows
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MovieListing } from '../types';

// Determine the correct path to server/data/videos/library.json
let serverDir = __dirname;
const normalizedDir = serverDir.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src/components')) {
  serverDir = path.dirname(path.dirname(serverDir));
} else if (normalizedDir.endsWith('/dist/src/components')) {
  serverDir = path.dirname(path.dirname(path.dirname(serverDir)));
}

const LIBRARY_JSON_PATH = path.join(serverDir, 'data', 'videos', 'library.json');

interface VideoLibraryEntry {
  id: string;
  filename: string;
  file_path: string;
  file_size: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  is_new: boolean;
}

interface VideoLibraryData {
  videos: VideoLibraryEntry[];
}

/**
 * Load video library from library.json
 */
export function loadVideoLibrary(): VideoLibraryData | null {
  try {
    if (!fs.existsSync(LIBRARY_JSON_PATH)) {
      console.warn(`⚠️ [VideoLibraryService] Library file not found: ${LIBRARY_JSON_PATH}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(LIBRARY_JSON_PATH, 'utf-8');
    const libraryData: VideoLibraryData = JSON.parse(fileContent);
    
    console.log(`✅ [VideoLibraryService] Loaded ${libraryData.videos?.length || 0} videos from library.json`);
    return libraryData;
  } catch (error: any) {
    console.error(`❌ [VideoLibraryService] Failed to load video library:`, error.message);
    return null;
  }
}

/**
 * Get all videos from the library
 */
export function getAllVideos(): VideoLibraryEntry[] {
  const library = loadVideoLibrary();
  return library?.videos || [];
}

/**
 * Get video by ID
 */
export function getVideoById(videoId: string): VideoLibraryEntry | null {
  const videos = getAllVideos();
  return videos.find(v => v.id === videoId) || null;
}

/**
 * Get video by filename
 */
export function getVideoByFilename(filename: string): VideoLibraryEntry | null {
  const videos = getAllVideos();
  return videos.find(v => v.filename === filename) || null;
}

/**
 * Search videos by tags
 */
export function searchVideosByTags(tags: string[]): VideoLibraryEntry[] {
  const videos = getAllVideos();
  if (tags.length === 0) return videos;
  
  return videos.filter(video => 
    tags.some(tag => video.tags.some(videoTag => 
      videoTag.toLowerCase().includes(tag.toLowerCase())
    ))
  );
}

/**
 * Get new videos (is_new: true)
 */
export function getNewVideos(): VideoLibraryEntry[] {
  const videos = getAllVideos();
  return videos.filter(v => v.is_new);
}

/**
 * Convert VideoLibraryEntry to MovieListing format for FlowWise workflows
 */
export function convertToMovieListing(video: VideoLibraryEntry, providerId: string, providerName: string, gardenId: string): MovieListing {
  const videoUrl = `/api/movie/video/${video.filename}`;
  
  return {
    id: video.id,
    movieId: video.id,
    movieTitle: video.filename.replace('.mp4', '').replace(/_/g, ' '),
    movieUrl: videoUrl,
    videoUrl: videoUrl,
    filename: video.filename,
    thumbnailUrl: videoUrl, // Use video URL as thumbnail for now
    price: 0, // All videos are FREE
    currency: 'USD',
    providerId: providerId,
    providerName: providerName,
    gardenId: gardenId,
    description: `Video file: ${video.filename}`,
    duration: 0, // Duration not available in library.json
    fileSize: video.file_size,
    tags: video.tags,
    createdAt: video.created_at,
    updatedAt: video.updated_at,
    isNew: video.is_new
  };
}

/**
 * Get all videos as movie listings for FlowWise workflows
 */
export function getAllVideosAsListings(providerId: string, providerName: string, gardenId: string): MovieListing[] {
  const videos = getAllVideos();
  return videos.map(video => convertToMovieListing(video, providerId, providerName, gardenId));
}

/**
 * Initialize Video Library Service
 */
export function initializeVideoLibraryService(): void {
  const library = loadVideoLibrary();
  if (library) {
    console.log(`✅ [VideoLibraryService] Initialized with ${library.videos?.length || 0} videos`);
    console.log(`✅ [VideoLibraryService] Library path: ${LIBRARY_JSON_PATH}`);
  } else {
    console.warn(`⚠️ [VideoLibraryService] Initialized but library file not found`);
  }
}

