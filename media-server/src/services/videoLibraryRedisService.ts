/**
 * Redis Video Library Service
 * Replaces library.json with Redis storage for video metadata
 */

import * as redisService from './redisService';
import { getRedisClient } from './redisService';

const VIDEO_PREFIX = 'video:';
const VIDEO_INDEX_KEY = 'videos:index';
const VIDEO_BY_AUTHOR_PREFIX = 'videos:author:';

/**
 * Get all videos from Redis
 */
export async function getAllVideos(): Promise<any[]> {
  const redis = getRedisClient();
  if (!redis || !redisService.isRedisAvailable()) {
    console.warn('⚠️ [VideoLibraryRedis] Redis not available, returning empty array');
    return [];
  }

  try {
    // Get all video IDs from index
    const videoIds = await redis.smembers(VIDEO_INDEX_KEY) || [];
    
    if (videoIds.length === 0) {
      return [];
    }

    // Get all video data
    const videos: any[] = [];
    for (const videoId of videoIds) {
      const videoData = await redis.get(`${VIDEO_PREFIX}${videoId}`);
      if (videoData) {
        try {
          videos.push(JSON.parse(videoData));
        } catch (error: any) {
          console.error(`❌ [VideoLibraryRedis] Failed to parse video ${videoId}:`, error.message);
        }
      }
    }

    return videos;
  } catch (error: any) {
    console.error(`❌ [VideoLibraryRedis] Error getting all videos:`, error.message);
    return [];
  }
}

/**
 * Get video by ID
 */
export async function getVideoById(videoId: string): Promise<any | null> {
  const redis = getRedisClient();
  if (!redis || !redisService.isRedisAvailable()) {
    return null;
  }

  try {
    const videoData = await redis.get(`${VIDEO_PREFIX}${videoId}`);
    if (videoData) {
      return JSON.parse(videoData);
    }
    return null;
  } catch (error: any) {
    console.error(`❌ [VideoLibraryRedis] Error getting video ${videoId}:`, error.message);
    return null;
  }
}

/**
 * Add or update video in Redis
 */
export async function saveVideo(video: any): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis || !redisService.isRedisAvailable()) {
    console.error('❌ [VideoLibraryRedis] Redis not available, cannot save video');
    return false;
  }

  try {
    const videoId = video.id || video.filename;
    if (!videoId) {
      console.error('❌ [VideoLibraryRedis] Video missing id or filename');
      return false;
    }

    // Ensure updated_at is set
    if (!video.updated_at) {
      video.updated_at = new Date().toISOString();
    }
    if (!video.created_at) {
      video.created_at = new Date().toISOString();
    }

    // Save video data
    const videoKey = `${VIDEO_PREFIX}${videoId}`;
    await redis.set(videoKey, JSON.stringify(video));

    // Add to index
    await redis.sadd(VIDEO_INDEX_KEY, videoId);

    // Add to author index
    if (video.author) {
      const authorKey = `${VIDEO_BY_AUTHOR_PREFIX}${video.author}`;
      await redis.sadd(authorKey, videoId);
    }

    return true;
  } catch (error: any) {
    console.error(`❌ [VideoLibraryRedis] Error saving video:`, error.message);
    return false;
  }
}

/**
 * Delete video from Redis
 */
export async function deleteVideo(videoId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis || !redisService.isRedisAvailable()) {
    return false;
  }

  try {
    // Get video to find author
    const video = await getVideoById(videoId);
    
    // Remove from index
    await redis.srem(VIDEO_INDEX_KEY, videoId);

    // Remove from author index
    if (video && video.author) {
      const authorKey = `${VIDEO_BY_AUTHOR_PREFIX}${video.author}`;
      await redis.srem(authorKey, videoId);
    }

    // Delete video data
    await redis.del(`${VIDEO_PREFIX}${videoId}`);

    return true;
  } catch (error: any) {
    console.error(`❌ [VideoLibraryRedis] Error deleting video:`, error.message);
    return false;
  }
}

/**
 * Get videos by author
 */
export async function getVideosByAuthor(authorId: string): Promise<any[]> {
  const redis = getRedisClient();
  if (!redis || !redisService.isRedisAvailable()) {
    return [];
  }

  try {
    const authorKey = `${VIDEO_BY_AUTHOR_PREFIX}${authorId}`;
    const videoIds = await redis.smembers(authorKey) || [];
    
    const videos: any[] = [];
    for (const videoId of videoIds) {
      const video = await getVideoById(videoId);
      if (video) {
        videos.push(video);
      }
    }

    return videos;
  } catch (error: any) {
    console.error(`❌ [VideoLibraryRedis] Error getting videos by author:`, error.message);
    return [];
  }
}

/**
 * Check if video exists
 */
export async function videoExists(videoId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis || !redisService.isRedisAvailable()) {
    return false;
  }

  try {
    const videoData = await redis.get(`${VIDEO_PREFIX}${videoId}`);
    return videoData !== null;
  } catch (error: any) {
    return false;
  }
}

/**
 * Get total video count
 */
export async function getVideoCount(): Promise<number> {
  const redis = getRedisClient();
  if (!redis || !redisService.isRedisAvailable()) {
    return 0;
  }

  try {
    const count = await redis.scard(VIDEO_INDEX_KEY);
    return count || 0;
  } catch (error: any) {
    console.error(`❌ [VideoLibraryRedis] Error getting video count:`, error.message);
    return 0;
  }
}

