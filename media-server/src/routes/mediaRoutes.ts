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

  return router;
}

