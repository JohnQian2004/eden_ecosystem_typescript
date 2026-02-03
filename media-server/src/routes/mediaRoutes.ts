/**
 * Media Server Routes - Express route handlers
 */

import { Router, Request, Response } from 'express';
import { MediaServer } from '../mediaServer';
import { imageGenerator } from '../services/imageGenerator';
import { nameImageService } from '../services/nameImageService';

export function mediaRoutes(mediaServer: MediaServer): Router {
  const router = Router();

  // Video endpoints: GET /api/media/video/:id
  router.get('/video/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    mediaServer.serveVideo(req, res, id);
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

  // Get all videos from library.json: GET /api/media/library/videos
  router.get('/library/videos', (req: Request, res: Response) => {
    console.log(`📹 [MediaServer] GET /api/media/library/videos - Getting videos from library.json`);
    try {
      const videos = mediaServer.getVideosFromLibrary();
      console.log(`✅ [MediaServer] Returning ${videos.length} videos from library.json`);
      
      // Transform videos to include correct video URLs pointing to media server
      const transformedVideos = videos.map((video: any) => {
        const videoId = video.id || video.filename;
        const videoUrl = `/api/media/video/${videoId}`;
        
        // Convert filename to title
        let title = video.filename.replace(/\.(mp4|mov|avi|mkv|webm)$/i, '');
        title = title.replace(/^(vibes_media_|downloaded_video_)/i, '');
        title = title.replace(/[_-]/g, ' ');
        title = title.split(' ')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        
        return {
          id: video.id || `video-${video.filename}`,
          filename: video.filename,
          file_path: video.file_path || `media/videos/${video.filename}`,
          title: title || video.filename,
          videoUrl: videoUrl,
          thumbnailUrl: videoUrl,
          tags: video.tags || [],
          author: video.author || 'root GOD bill.draper.auto@gmail.com (bill draper)',
          duration: video.duration,
          resolution_width: video.resolution_width,
          resolution_height: video.resolution_height,
          frame_rate: video.frame_rate,
          file_size: video.file_size,
          codec: video.codec,
          created_at: video.created_at || new Date().toISOString(),
          updated_at: video.updated_at || new Date().toISOString(),
          analyzed_at: video.analyzed_at,
          is_new: video.is_new,
          analysis: video.analysis || {
            content_tags: [],
            shot_type: undefined,
            scene_type: undefined
          }
        };
      });
      
      // Return in the format Angular expects: { success: true, data: videos[], count: number }
      res.json({
        success: true,
        data: transformedVideos,
        count: transformedVideos.length
      });
    } catch (error: any) {
      console.error(`❌ [MediaServer] Error getting videos:`, error.message);
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

