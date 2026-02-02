/**
 * Media Server Routes - HTTP route handlers for media server
 */

import * as http from 'http';
import { mediaServer } from './mediaServer';

export function handleMediaRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
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
  if (pathname.startsWith('/api/media/') && !pathname.includes('/video/') && !pathname.includes('/image/')) {
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

  return false;
}

