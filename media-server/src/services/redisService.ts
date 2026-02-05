/**
 * Redis Service for TikTok-like features
 * Handles likes, follows, and social interactions
 * Uses embedded Redis server that runs inside the Node.js process
 */

import { EmbeddedRedisServer } from './embeddedRedis';

let redisServer: EmbeddedRedisServer | null = null;

/**
 * Initialize embedded Redis server (runs inside Node.js process)
 */
export async function initRedis(): Promise<void> {
  try {
    redisServer = new EmbeddedRedisServer();
    await redisServer.connect();
    console.log('✅ [Redis] Embedded server started - TikTok features (likes/follows) enabled');
  } catch (error: any) {
    console.error(`❌ [Redis] Failed to start embedded server:`, error.message);
    redisServer = null;
  }
}

/**
 * Get Redis server instance
 */
export function getRedisClient(): EmbeddedRedisServer | null {
  return redisServer;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisServer !== null && redisServer.isOpen;
}

/**
 * Like a video
 * @param videoId Video ID
 * @param userId User ID (default: 'anonymous')
 * @returns true if liked, false if unliked
 */
export async function likeVideo(videoId: string, userId: string = 'anonymous'): Promise<boolean> {
  if (isRedisAvailable() && redisServer) {
    try {
      const likeKey = `video:${videoId}:likes`;
      const userLikeKey = `user:${userId}:likes:${videoId}`;
      
      // Check if user already liked this video
      const alreadyLiked = await redisServer.get(userLikeKey);
      
      if (alreadyLiked) {
        // Unlike: remove from set and decrement count
        await redisServer.del(userLikeKey);
        const currentCount = await redisServer.get(likeKey);
        const newCount = Math.max(0, (currentCount ? parseInt(currentCount, 10) : 0) - 1);
        await redisServer.set(likeKey, newCount.toString());
        return false;
      } else {
        // Like: add to set and increment count
        await redisServer.set(userLikeKey, '1');
        const currentCount = await redisServer.get(likeKey);
        const newCount = (currentCount ? parseInt(currentCount, 10) : 0) + 1;
        await redisServer.set(likeKey, newCount.toString());
        return true;
      }
    } catch (error: any) {
      console.error(`❌ [Redis] Error liking video ${videoId}:`, error.message);
      throw error;
    }
  }
  
  throw new Error('Redis server not available');
}

/**
 * Check if user liked a video
 */
export async function hasUserLikedVideo(videoId: string, userId: string = 'anonymous'): Promise<boolean> {
  if (isRedisAvailable() && redisServer) {
    try {
      const userLikeKey = `user:${userId}:likes:${videoId}`;
      const exists = await redisServer.get(userLikeKey);
      return exists !== null;
    } catch (error: any) {
      console.error(`❌ [Redis] Error checking like status:`, error.message);
      return false;
    }
  }
  
  return false;
}

/**
 * Get like count for a video
 */
export async function getVideoLikeCount(videoId: string): Promise<number> {
  if (isRedisAvailable() && redisServer) {
    try {
      const likeKey = `video:${videoId}:likes`;
      const count = await redisServer.get(likeKey);
      return count ? parseInt(count, 10) : 0;
    } catch (error: any) {
      console.error(`❌ [Redis] Error getting like count:`, error.message);
      return 0;
    }
  }
  
  return 0;
}

/**
 * Get like counts for multiple videos
 */
export async function getVideoLikeCounts(videoIds: string[]): Promise<Record<string, number>> {
  if (videoIds.length === 0) {
    return {};
  }

  if (isRedisAvailable() && redisServer) {
    try {
      const counts: Record<string, number> = {};
      await Promise.all(
        videoIds.map(async (videoId) => {
          counts[videoId] = await getVideoLikeCount(videoId);
        })
      );
      return counts;
    } catch (error: any) {
      console.error(`❌ [Redis] Error getting like counts:`, error.message);
      return {};
    }
  }
  
  return {};
}

/**
 * Follow a user (video author)
 * @param authorId Author/User ID to follow
 * @param userId Current user ID (default: 'anonymous')
 * @returns true if followed, false if unfollowed
 */
export async function followUser(authorId: string, userId: string = 'anonymous'): Promise<boolean> {
  if (isRedisAvailable() && redisServer) {
    try {
      const followKey = `user:${userId}:follows`;
      const followerKey = `user:${authorId}:followers`;
      const userFollowKey = `user:${userId}:follows:${authorId}`;
      
      // Check if user already follows this author
      const alreadyFollows = await redisServer.get(userFollowKey);
      
      if (alreadyFollows) {
        // Unfollow: remove from sets
        await redisServer.del(userFollowKey);
        await redisServer.srem(followKey, authorId);
        await redisServer.srem(followerKey, userId);
        return false;
      } else {
        // Follow: add to sets
        await redisServer.set(userFollowKey, '1');
        await redisServer.sadd(followKey, authorId);
        await redisServer.sadd(followerKey, userId);
        return true;
      }
    } catch (error: any) {
      console.error(`❌ [Redis] Error following user ${authorId}:`, error.message);
      throw error;
    }
  }
  
  throw new Error('Redis server not available');
}

/**
 * Check if user follows an author
 */
export async function hasUserFollowedAuthor(authorId: string, userId: string = 'anonymous'): Promise<boolean> {
  if (isRedisAvailable() && redisServer) {
    try {
      const userFollowKey = `user:${userId}:follows:${authorId}`;
      const exists = await redisServer.get(userFollowKey);
      return exists !== null;
    } catch (error: any) {
      console.error(`❌ [Redis] Error checking follow status:`, error.message);
      return false;
    }
  }
  
  return false;
}

/**
 * Get follower count for an author
 */
export async function getAuthorFollowerCount(authorId: string): Promise<number> {
  if (isRedisAvailable() && redisServer) {
    try {
      const followerKey = `user:${authorId}:followers`;
      const count = await redisServer.scard(followerKey);
      return count;
    } catch (error: any) {
      console.error(`❌ [Redis] Error getting follower count:`, error.message);
      return 0;
    }
  }
  
  return 0;
}

/**
 * Get follow status for multiple authors
 */
export async function getAuthorFollowStatuses(authorIds: string[], userId: string = 'anonymous'): Promise<Record<string, boolean>> {
  if (authorIds.length === 0) {
    return {};
  }

  if (isRedisAvailable() && redisServer) {
    try {
      const statuses: Record<string, boolean> = {};
      await Promise.all(
        authorIds.map(async (authorId) => {
          statuses[authorId] = await hasUserFollowedAuthor(authorId, userId);
        })
      );
      return statuses;
    } catch (error: any) {
      console.error(`❌ [Redis] Error getting follow statuses:`, error.message);
      return {};
    }
  }
  
  return {};
}

/**
 * Get total likes for all videos by an author
 */
export async function getTotalLikesForAuthor(authorId: string, videoIds: string[]): Promise<number> {
  if (videoIds.length === 0) {
    return 0;
  }

  if (isRedisAvailable() && redisServer) {
    try {
      let totalLikes = 0;
      await Promise.all(
        videoIds.map(async (videoId) => {
          const count = await getVideoLikeCount(videoId);
          totalLikes += count;
        })
      );
      return totalLikes;
    } catch (error: any) {
      console.error(`❌ [Redis] Error getting total likes for author:`, error.message);
      return 0;
    }
  }
  
  return 0;
}

