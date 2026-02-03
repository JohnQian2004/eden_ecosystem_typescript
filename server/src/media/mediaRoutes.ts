/**
 * Media Server Routes - HTTP route handlers for media server
 */

import * as http from 'http';
import { mediaServer } from './mediaServer';

export async function handleMediaRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<boolean> {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    // For sync endpoint, allow POST
    const allowedMethods = pathname === '/api/media/library/sync' 
      ? 'GET, HEAD, POST, OPTIONS'
      : 'GET, HEAD, OPTIONS';
    
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': allowedMethods,
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }

  // Video endpoints: /api/media/video/:id
  if (pathname.startsWith('/api/media/video/')) {
    const videoId = pathname.substring('/api/media/video/'.length);
    if (req.method === 'GET' || req.method === 'HEAD') {
      mediaServer.serveVideo(req, res, videoId);
      return true;
    }
  }

  // Image endpoints: /api/media/image/:id
  if (pathname.startsWith('/api/media/image/')) {
    const imageId = pathname.substring('/api/media/image/'.length);
    if (req.method === 'GET' || req.method === 'HEAD') {
      mediaServer.serveImage(req, res, imageId);
      return true;
    }
  }

  // List all media: /api/media/list
  if (pathname === '/api/media/list' && req.method === 'GET') {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const type = url.searchParams.get('type') as 'video' | 'image' | undefined;
    
    const files = mediaServer.getAllMediaFiles(type);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ success: true, data: files, count: files.length }));
    return true;
  }

  // Get media metadata: /api/media/:id
  if (pathname.startsWith('/api/media/') && !pathname.includes('/video/') && !pathname.includes('/image/') && !pathname.includes('/library/')) {
    const mediaId = pathname.substring('/api/media/'.length);
    if (req.method === 'GET') {
      const mediaFile = mediaServer.getMediaFile(mediaId);
      if (mediaFile) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ success: true, data: mediaFile }));
      } else {
        res.writeHead(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ success: false, error: 'Media not found' }));
      }
      return true;
    }
  }

  // Sync library: POST /api/media/library/sync
  if (pathname === '/api/media/library/sync') {
    if (req.method === 'POST') {
      console.log(`🔄 [MediaServer] POST /api/media/library/sync - Starting library sync`);
      try {
        const result = await mediaServer.syncLibrary();
        console.log(`✅ [MediaServer] Sync completed: ${result.added} added, ${result.updated} updated, ${result.removed} removed`);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({
          status: 'success',
          data: result,
          message: `Sync completed: ${result.added} added, ${result.updated} updated, ${result.removed} removed`
        }));
      } catch (error: any) {
        console.error(`❌ [MediaServer] Sync error:`, error.message);
        console.error(`❌ [MediaServer] Error stack:`, error.stack);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({
          status: 'error',
          message: error.message || 'Failed to sync library'
        }));
      }
      return true;
    }
  }

  return false;
}

