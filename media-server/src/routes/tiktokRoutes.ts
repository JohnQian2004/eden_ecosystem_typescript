/**
 * TikTok Routes - Social features for video feed
 * Handles likes, follows, and random video feed
 */

import { Router, Request, Response } from 'express';
import { MediaServer } from '../mediaServer';
import * as redisService from '../services/redisService';

export function tiktokRoutes(mediaServer: MediaServer): Router {
  const router = Router();

  // Get random videos for TikTok feed: GET /api/media/tiktok/feed?limit=10&offset=0
  router.get('/feed', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const userId = (req.query.userId as string) || 'anonymous';

      console.log(`📱 [TikTok] Getting feed: limit=${limit}, offset=${offset}`);

      // Get all videos from library
      const allVideos = mediaServer.getVideosFromLibrary();
      
      // Shuffle array for random order
      const shuffled = [...allVideos].sort(() => Math.random() - 0.5);
      
      // Get paginated results
      const videos = shuffled.slice(offset, offset + limit);

      // Get like counts and follow statuses if Redis is available
      const videoIds = videos.map((v: any) => v.id || v.filename);
      const authorIds = [...new Set(videos.map((v: any) => v.author || 'anonymous'))];

      // Try to get social data from Redis, but don't fail if Redis is unavailable
      const socialDataPromise = redisService.isRedisAvailable() 
        ? Promise.all([
            redisService.getVideoLikeCounts(videoIds),
            redisService.getAuthorFollowStatuses(authorIds, userId),
            Promise.all(authorIds.map(authorId => 
              redisService.getAuthorFollowerCount(authorId).then(count => ({ authorId, count }))
            ))
          ]).catch(() => {
            // Return empty data if Redis fails
            return [
              {} as Record<string, number>,
              {} as Record<string, boolean>,
              [] as Array<{ authorId: string; count: number }>
            ];
          })
        : Promise.resolve([
            {} as Record<string, number>,
            {} as Record<string, boolean>,
            [] as Array<{ authorId: string; count: number }>
          ]);

      socialDataPromise.then(([likeCounts, followStatuses, followerCounts]) => {
        const followerCountMap: Record<string, number> = {};
        (followerCounts as Array<{ authorId: string; count: number }>).forEach(({ authorId, count }) => {
          followerCountMap[authorId] = count;
        });

        // Transform videos with social data
        const transformedVideos = videos.map((video: any) => {
          const videoId = video.id || video.filename;
          const author = video.author || 'anonymous';
          
          // Convert filename to title
          let title = video.filename.replace(/\.(mp4|mov|avi|mkv|webm)$/i, '');
          title = title.replace(/^(vibes_media_|downloaded_video_)/i, '');
          title = title.replace(/[_-]/g, ' ');
          title = title.split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

          return {
            id: videoId,
            filename: video.filename,
            title: title || video.filename,
            videoUrl: `/api/media/video/${videoId}`,
            thumbnailUrl: `/api/media/video/${videoId}`,
            author: author,
            authorDisplayName: author.split('(')[1]?.replace(')', '') || author,
            likes: (likeCounts as Record<string, number>)[videoId] || 0,
            isLiked: false, // Will be set by client if needed
            isFollowing: (followStatuses as Record<string, boolean>)[author] || false,
            followers: followerCountMap[author] || 0,
            tags: video.tags || [],
            duration: video.duration,
            file_size: video.file_size,
            created_at: video.created_at || new Date().toISOString(),
          };
        });

        res.json({
          success: true,
          data: transformedVideos,
          count: transformedVideos.length,
          total: allVideos.length,
          hasMore: offset + limit < allVideos.length
        });
      }).catch((error: any) => {
        console.error('❌ [TikTok] Error getting social data:', error);
        // Return videos without social data if Redis fails
        const transformedVideos = videos.map((video: any) => {
          const videoId = video.id || video.filename;
          let title = video.filename.replace(/\.(mp4|mov|avi|mkv|webm)$/i, '');
          title = title.replace(/^(vibes_media_|downloaded_video_)/i, '');
          title = title.replace(/[_-]/g, ' ');
          title = title.split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

          return {
            id: videoId,
            filename: video.filename,
            title: title || video.filename,
            videoUrl: `/api/media/video/${videoId}`,
            thumbnailUrl: `/api/media/video/${videoId}`,
            author: video.author || 'anonymous',
            authorDisplayName: (video.author || 'anonymous').split('(')[1]?.replace(')', '') || video.author || 'anonymous',
            likes: 0,
            isLiked: false,
            isFollowing: false,
            followers: 0,
            tags: video.tags || [],
            duration: video.duration,
            file_size: video.file_size,
            created_at: video.created_at || new Date().toISOString(),
          };
        });

        res.json({
          success: true,
          data: transformedVideos,
          count: transformedVideos.length,
          total: allVideos.length,
          hasMore: offset + limit < allVideos.length
        });
      });
    } catch (error: any) {
      console.error('❌ [TikTok] Error getting feed:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get feed', 
        message: error.message 
      });
    }
  });

  // Like/Unlike a video: POST /api/media/tiktok/like/:videoId
  router.post('/like/:videoId', async (req: Request, res: Response) => {
    try {
      const { videoId } = req.params;
      const userId = (req.body.userId || req.query.userId as string) || 'anonymous';

      // Works with in-memory store if Redis is not available

      const isLiked = await redisService.likeVideo(videoId, userId);
      const likeCount = await redisService.getVideoLikeCount(videoId);

      res.json({
        success: true,
        data: {
          videoId,
          isLiked,
          likeCount
        }
      });
    } catch (error: any) {
      console.error('❌ [TikTok] Error liking video:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to like video', 
        message: error.message 
      });
    }
  });

  // Follow/Unfollow an author: POST /api/media/tiktok/follow/:authorId
  router.post('/follow/:authorId', async (req: Request, res: Response) => {
    try {
      const { authorId } = req.params;
      const userId = (req.body.userId || req.query.userId as string) || 'anonymous';

      // Works with in-memory store if Redis is not available

      const isFollowing = await redisService.followUser(authorId, userId);
      const followerCount = await redisService.getAuthorFollowerCount(authorId);

      res.json({
        success: true,
        data: {
          authorId,
          isFollowing,
          followerCount
        }
      });
    } catch (error: any) {
      console.error('❌ [TikTok] Error following user:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to follow user', 
        message: error.message 
      });
    }
  });

  // Get video like status: GET /api/media/tiktok/like/:videoId/status
  router.get('/like/:videoId/status', async (req: Request, res: Response) => {
    try {
      const { videoId } = req.params;
      const userId = (req.query.userId as string) || 'anonymous';

      if (!redisService.isRedisAvailable()) {
        res.json({
          success: true,
          data: {
            videoId,
            isLiked: false,
            likeCount: 0
          }
        });
        return;
      }

      const [isLiked, likeCount] = await Promise.all([
        redisService.hasUserLikedVideo(videoId, userId),
        redisService.getVideoLikeCount(videoId)
      ]);

      res.json({
        success: true,
        data: {
          videoId,
          isLiked,
          likeCount
        }
      });
    } catch (error: any) {
      console.error('❌ [TikTok] Error getting like status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get like status', 
        message: error.message 
      });
    }
  });

  return router;
}

