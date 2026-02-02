/**
 * Eden Media Server
 * Dedicated server for serving videos and images
 */

import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { MediaServer } from './mediaServer';
import { mediaRoutes } from './routes/mediaRoutes';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize media server
const mediaServer = new MediaServer({
  baseUrl: '/api/media',
  maxFileSize: 500 * 1024 * 1024, // 500MB
  allowedVideoFormats: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
  allowedImageFormats: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
});

// Media routes
app.use('/api/media', mediaRoutes(mediaServer));

// Direct image generation routes (as per user requirements)
// GET /image?random=999999
// GET /image/ai?text=sky
app.get('/image', async (req, res) => {
  const random = req.query.random;
  if (random) {
    const { imageGenerator } = await import('./services/imageGenerator');
    try {
      // Convert query parameter to string or number
      let randomValue: string | number;
      if (typeof random === 'string') {
        randomValue = random;
      } else if (typeof random === 'number') {
        randomValue = random;
      } else if (Array.isArray(random)) {
        randomValue = typeof random[0] === 'string' ? random[0] : String(random[0]);
      } else {
        randomValue = String(random);
      }
      
      const imageBuffer = await imageGenerator.generateRandomImage(randomValue);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(imageBuffer);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to generate random image', message: error.message });
    }
  } else {
    res.status(400).json({ error: 'Missing random parameter' });
  }
});

app.get('/image/ai', async (req, res) => {
  const text = req.query.text as string;
  const width = req.query.width ? parseInt(req.query.width as string, 10) : undefined;
  const height = req.query.height ? parseInt(req.query.height as string, 10) : undefined;

  if (!text) {
    res.status(400).json({ error: 'Missing text parameter for AI image generation' });
    return;
  }

  const { imageGenerator } = await import('./services/imageGenerator');
  try {
    const imageBuffer = await imageGenerator.generateAIImage(text, { width, height });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(imageBuffer);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate AI image', message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'eden-media-server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎬 Eden Media Server');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📹 Video endpoint: http://localhost:${PORT}/api/media/video/:id`);
  console.log(`🖼️  Image endpoint: http://localhost:${PORT}/api/media/image/:id`);
  console.log(`🎲 Random image: http://localhost:${PORT}/image?random=999999`);
  console.log(`🎨 AI image: http://localhost:${PORT}/image/ai?text=sky`);
  console.log(`📋 List endpoint: http://localhost:${PORT}/api/media/list`);
  console.log('═══════════════════════════════════════════════════════════\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

