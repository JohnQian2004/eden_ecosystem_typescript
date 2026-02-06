/**
 * Media Server Routes - Express route handlers
 */

import { Router, Request, Response } from 'express';
import { MediaServer } from '../mediaServer';
import { imageGenerator } from '../services/imageGenerator';
import { nameImageService } from '../services/nameImageService';
import * as fs from 'fs';
import * as path from 'path';

export function mediaRoutes(mediaServer: MediaServer): Router {
  const router = Router();

  // Video endpoints: GET /api/media/video/:id
  router.get('/video/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    await mediaServer.serveVideo(req, res, id);
  });

  // Random image generation: GET /api/media/image?random=999999
  // Name-based image: GET /api/media/image?name=genesis
  // Also supports: GET /image?random=999999 or GET /image?name=genesis (without /api/media prefix for flexibility)
  router.get('/image', async (req: Request, res: Response) => {
    const random = req.query.random;
    const name = req.query.name as string | undefined;
    
    // Handle name-based image requests (with caching)
    if (name) {
      try {
        console.log(`🖼️ [MediaRoutes] Requesting image for name: "${name}"`);
        const result = await nameImageService.getImageByName(name);
        
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Image-Source', result.source);
        res.send(result.buffer);
        return;
      } catch (error: any) {
        console.error('❌ [MediaRoutes] Failed to fetch name-based image:', error);
        res.status(500).json({ error: 'Failed to fetch image', message: error.message });
        return;
      }
    }
    
    // Handle random image generation
    if (random) {
      try {
        // Convert query parameter to string or number
        const randomValue: string | number = typeof random === 'string' 
          ? random 
          : typeof random === 'number' 
          ? random 
          : Array.isArray(random) 
          ? (typeof random[0] === 'string' ? random[0] : String(random[0]))
          : String(random);
        
        const imageBuffer = await imageGenerator.generateRandomImage(randomValue);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(imageBuffer);
      } catch (error: any) {
        console.error('❌ [MediaRoutes] Failed to generate random image:', error);
        res.status(500).json({ error: 'Failed to generate random image', message: error.message });
      }
      return;
    }

    // If no random or name parameter, treat as regular image request by ID
    // This maintains backward compatibility
    res.status(400).json({ error: 'Missing image ID, random parameter, or name parameter' });
  });

  // Picsum random image: GET /api/media/image/picsum
  router.get('/image/picsum', async (req: Request, res: Response) => {
    try {
      console.log(`🖼️ [MediaRoutes] Requesting Picsum random image`);
      const imageBuffer = await nameImageService.getPicsumImage();
      
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache for random images
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(imageBuffer);
    } catch (error: any) {
      console.error('❌ [MediaRoutes] Failed to fetch Picsum image:', error);
      res.status(500).json({ error: 'Failed to fetch Picsum image', message: error.message });
    }
  });

  // AI image generation: GET /api/media/image/ai?text=sky
  router.get('/image/ai', async (req: Request, res: Response) => {
    const text = req.query.text as string;
    const width = req.query.width ? parseInt(req.query.width as string, 10) : undefined;
    const height = req.query.height ? parseInt(req.query.height as string, 10) : undefined;

    if (!text) {
      res.status(400).json({ error: 'Missing text parameter for AI image generation' });
      return;
    }

    try {
      console.log(`🎨 [MediaRoutes] Generating AI image for text: ${text}`);
      const imageBuffer = await imageGenerator.generateAIImage(text, { width, height });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache for AI images
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(imageBuffer);
    } catch (error: any) {
      console.error('❌ [MediaRoutes] Failed to generate AI image:', error);
      res.status(500).json({ error: 'Failed to generate AI image', message: error.message });
    }
  });

  // Image endpoints: GET /api/media/image/:id (existing stored images)
  router.get('/image/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    mediaServer.serveImage(req, res, id);
  });

  // Snapshot endpoints: GET /api/media/snapshot/:filename (video thumbnails)
  router.get('/snapshot/:filename', (req: Request, res: Response) => {
    const { filename } = req.params;
    const thumbnailGenerator = require('../services/thumbnailGenerator');
    const snapshotPath = thumbnailGenerator.getSnapshotPath(filename.replace(/\.(jpeg|png)$/i, ''));
    
    if (!snapshotPath || !fs.existsSync(snapshotPath)) {
      res.status(404).json({ success: false, error: 'Snapshot not found' });
      return;
    }

    // Determine content type
    const ext = path.extname(snapshotPath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(path.resolve(snapshotPath));
  });

  // List all media: GET /api/media/list?type=video|image
  router.get('/list', (req: Request, res: Response) => {
    const type = req.query.type as 'video' | 'image' | undefined;
    const files = mediaServer.getAllMediaFiles(type);
    res.json({ 
      success: true, 
      data: files, 
      count: files.length 
    });
  });

  // Get media metadata: GET /api/media/:id
  router.get('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const mediaFile = mediaServer.getMediaFile(id);
    if (mediaFile) {
      res.json({ success: true, data: mediaFile });
    } else {
      res.status(404).json({ success: false, error: 'Media not found' });
    }
  });

  // Get all videos from Redis: GET /api/media/library/videos
  router.get('/library/videos', async (req: Request, res: Response) => {
    console.log(`📹 [MediaServer] GET /api/media/library/videos - Getting videos from Redis`);
    try {
      const videoLibraryRedis = require('../services/videoLibraryRedisService');
      const redisService = require('../services/redisService');
      
      // Check cache first (cache key: videos:list:transformed)
      const CACHE_KEY = 'videos:list:transformed';
      const CACHE_TTL = 300; // 5 minutes cache
      
      if (redisService.isRedisAvailable()) {
        const redis = redisService.getRedisClient();
        if (redis) {
          try {
            const cached = await redis.get(CACHE_KEY);
            if (cached) {
              // Parse once and reuse
              const cachedData = JSON.parse(cached);
              console.log(`⚡ [MediaServer] Returning cached video list (${cachedData.count} videos)`);
              res.json(cachedData);
              return;
            }
          } catch (error: any) {
            console.warn(`⚠️ [MediaServer] Cache read error: ${error.message}`);
          }
        }
      }
      
      // Cache miss - get videos from Redis
      let videos: any[] = [];
      try {
        videos = await videoLibraryRedis.getAllVideos();
        console.log(`✅ [MediaServer] Loaded ${videos.length} videos from Redis`);
        
        // If Redis is empty, scan directory and populate Redis
        if (videos.length === 0) {
          console.log(`📹 [MediaServer] Redis is empty, scanning directory...`);
          const scannedVideos = await mediaServer.scanVideosDirectory();
          console.log(`📹 [MediaServer] Scanned ${scannedVideos.length} videos from directory`);
          
          if (scannedVideos.length > 0) {
            // Populate Redis with scanned videos (batch save for performance)
            console.log(`💾 [MediaServer] Populating Redis with ${scannedVideos.length} videos (batch save)...`);
            const startTime = Date.now();
            const result = await videoLibraryRedis.saveVideosBatch(scannedVideos);
            const duration = Date.now() - startTime;
            videos = scannedVideos;
            console.log(`✅ [MediaServer] Redis populated: ${result.saved} saved, ${result.errors} errors (${duration}ms)`);
          }
        }
      } catch (error: any) {
        console.error(`❌ [MediaServer] Error loading videos from Redis:`, error.message);
        console.error(`❌ [MediaServer] Error stack:`, error.stack);
        // Fallback: scan directory if Redis fails
        console.log(`📹 [MediaServer] Falling back to directory scan...`);
        videos = await mediaServer.scanVideosDirectory();
        console.log(`📹 [MediaServer] Scanned ${videos.length} videos from directory (fallback)`);
      }
      
      // Transform videos to include correct video URLs pointing to media server
      // Pre-compute default values to avoid repeated operations
      const defaultAuthor = 'root GOD bill.draper.auto@gmail.com (bill draper)';
      const defaultAnalysis = {
        content_tags: [],
        shot_type: undefined,
        scene_type: undefined
      };
      const now = new Date().toISOString();
      
      // Load thumbnail generator
      const thumbnailGenerator = require('../services/thumbnailGenerator');
      
      // Use for loop instead of map+filter for better performance with large arrays
      const transformedVideos: any[] = [];
      for (const video of videos) {
        // Skip invalid videos early
        if (!video || (!video.id && !video.filename)) {
          continue;
        }
        
        try {
          const videoId = video.id || video.filename;
          const filename = video.filename || videoId || 'unknown';
          const videoUrl = `/api/media/video/${videoId}`;
          
          // Check if .jpeg snapshot exists (same filename, different extension)
          let snapshotUrl = thumbnailGenerator.getSnapshotUrl(videoId);
          let thumbnailUrl = videoUrl; // Default to video URL
          
          if (snapshotUrl) {
            // Snapshot exists, use it for thumbnail
            thumbnailUrl = snapshotUrl;
            console.log(`📸 [MediaServer] Using existing snapshot for ${videoId}: ${snapshotUrl}`);
          } else {
            // No snapshot exists, generate it now (synchronously)
            // Determine video file path
            let videoPath: string;
            if (video.file_path) {
              if (path.isAbsolute(video.file_path)) {
                videoPath = video.file_path;
              } else {
                const cleanPath = video.file_path.replace(/^videos[\\\/]/, '');
                videoPath = path.join(path.dirname(path.dirname(__dirname)), 'data', 'videos', cleanPath);
              }
            } else {
              videoPath = path.join(path.dirname(path.dirname(__dirname)), 'data', 'videos', filename);
            }
            
            // Check if video file exists before generating
            if (fs.existsSync(videoPath)) {
              console.log(`📸 [MediaServer] Generating snapshot for ${videoId}...`);
              // Generate snapshot synchronously
              const generatedSnapshotUrl = await thumbnailGenerator.generateThumbnail(videoPath, videoId);
              if (generatedSnapshotUrl) {
                thumbnailUrl = generatedSnapshotUrl;
                snapshotUrl = generatedSnapshotUrl;
                console.log(`✅ [MediaServer] Generated snapshot for ${videoId}: ${snapshotUrl}`);
              } else {
                console.warn(`⚠️ [MediaServer] Failed to generate snapshot for ${videoId}, using video URL`);
              }
            } else {
              console.warn(`⚠️ [MediaServer] Video file not found: ${videoPath}`);
            }
          }
          
          // Convert filename to title (optimized - single pass where possible)
          let title = filename;
          if (filename && filename !== 'unknown') {
            // Chain replacements more efficiently
            title = filename
              .replace(/\.(mp4|mov|avi|mkv|webm)$/i, '')
              .replace(/^(vibes_media_|downloaded_video_)/i, '')
              .replace(/[_-]/g, ' ')
              .split(' ')
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
          }
          
          transformedVideos.push({
            id: video.id || `video-${filename}`,
            filename: filename,
            file_path: video.file_path || `videos/${filename}`,
            title: title || filename,
            videoUrl: videoUrl,
            thumbnailUrl: thumbnailUrl, // This will be .jpeg if available, .mp4 otherwise
            snapshotUrl: snapshotUrl || null, // Include snapshot URL separately
            tags: video.tags || [],
            author: video.author || defaultAuthor,
            duration: video.duration,
            resolution_width: video.resolution_width,
            resolution_height: video.resolution_height,
            frame_rate: video.frame_rate,
            file_size: video.file_size,
            codec: video.codec,
            created_at: video.created_at || now,
            updated_at: video.updated_at || now,
            analyzed_at: video.analyzed_at,
            is_new: video.is_new,
            analysis: video.analysis || defaultAnalysis
          });
        } catch (error: any) {
          console.error(`❌ [MediaServer] Error transforming video:`, error.message, video);
          // Skip this video, continue with next
        }
      }
      
      // Return in the format Angular expects: { success: true, data: videos[], count: number }
      const response = {
        success: true,
        data: transformedVideos,
        count: transformedVideos.length
      };
      
      // Cache the transformed response (only if we have videos to avoid caching empty results)
      if (transformedVideos.length > 0 && redisService.isRedisAvailable()) {
        const redis = redisService.getRedisClient();
        if (redis) {
          try {
            await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(response));
            console.log(`💾 [MediaServer] Cached video list (${transformedVideos.length} videos) for ${CACHE_TTL} seconds`);
          } catch (error: any) {
            console.warn(`⚠️ [MediaServer] Cache write error: ${error.message}`);
          }
        }
      } else if (transformedVideos.length === 0) {
        console.log(`⚠️ [MediaServer] Not caching empty result - Redis may need to be populated`);
      }
      
      res.json(response);
    } catch (error: any) {
      console.error(`❌ [MediaServer] Error getting videos:`, error.message);
      console.error(`❌ [MediaServer] Error stack:`, error.stack);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get videos',
        data: [],
        count: 0
      });
    }
  });

  // Sync library: POST /api/media/library/sync
  router.post('/library/sync', async (req: Request, res: Response) => {
    console.log(`🔄 [MediaServer] POST /api/media/library/sync - Starting library sync`);
    try {
      const result = await mediaServer.syncLibrary();
      res.json({
        status: 'success',
        data: result,
        message: `Sync completed: ${result.added} added, ${result.updated} updated, ${result.removed} removed`
      });
    } catch (error: any) {
      console.error(`❌ [MediaServer] Sync error:`, error.message);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to sync library'
      });
    }
  });

  return router;
}

