/**
 * Media Server - Dedicated server for serving videos and images
 * 
 * This module provides a centralized media server that handles:
 * - Video file serving with range request support
 * - Image file serving
 * - File upload management
 * - Storage organization
 * - Metadata management
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { createReadStream, statSync } from 'fs';

// Determine server directory
let serverDir = __dirname;
const normalizedDir = serverDir.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src/media')) {
  serverDir = path.dirname(path.dirname(serverDir));
} else if (normalizedDir.endsWith('/dist/src/media')) {
  serverDir = path.dirname(path.dirname(path.dirname(serverDir)));
}

// Media storage paths
const MEDIA_BASE_DIR = path.join(serverDir, 'data', 'media');
const VIDEOS_DIR = path.join(MEDIA_BASE_DIR, 'videos');
const IMAGES_DIR = path.join(MEDIA_BASE_DIR, 'images');
const THUMBNAILS_DIR = path.join(MEDIA_BASE_DIR, 'thumbnails');
const METADATA_DIR = path.join(MEDIA_BASE_DIR, 'metadata');

// Ensure directories exist
function ensureDirectories(): void {
  [MEDIA_BASE_DIR, VIDEOS_DIR, IMAGES_DIR, THUMBNAILS_DIR, METADATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 [MediaServer] Created directory: ${dir}`);
    }
  });
}

// Initialize directories on module load
ensureDirectories();

export interface MediaFile {
  id: string;
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  type: 'video' | 'image';
  createdAt: string;
  updatedAt: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    codec?: string;
    bitrate?: number;
    [key: string]: any;
  };
}

export interface MediaServerConfig {
  port?: number;
  baseUrl?: string;
  maxFileSize?: number;
  allowedVideoFormats?: string[];
  allowedImageFormats?: string[];
}

const DEFAULT_CONFIG: Required<MediaServerConfig> = {
  port: 3001,
  baseUrl: '/api/media',
  maxFileSize: 500 * 1024 * 1024, // 500MB
  allowedVideoFormats: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
  allowedImageFormats: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
};

export class MediaServer {
  private config: Required<MediaServerConfig>;
  private mediaRegistry: Map<string, MediaFile> = new Map();

  constructor(config: MediaServerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadMediaRegistry();
  }

  /**
   * Load media registry from metadata files
   */
  private loadMediaRegistry(): void {
    try {
      const metadataFiles = fs.readdirSync(METADATA_DIR).filter(f => f.endsWith('.json'));
      let count = 0;
      
      metadataFiles.forEach(file => {
        try {
          const filePath = path.join(METADATA_DIR, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const mediaFile: MediaFile = JSON.parse(content);
          this.mediaRegistry.set(mediaFile.id, mediaFile);
          count++;
        } catch (error) {
          console.error(`❌ [MediaServer] Failed to load metadata file ${file}:`, error);
        }
      });
      
      console.log(`✅ [MediaServer] Loaded ${count} media files from registry`);
    } catch (error) {
      console.error(`❌ [MediaServer] Failed to load media registry:`, error);
    }
  }

  /**
   * Save media file metadata
   */
  private saveMediaMetadata(mediaFile: MediaFile): void {
    try {
      const metadataPath = path.join(METADATA_DIR, `${mediaFile.id}.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(mediaFile, null, 2), 'utf-8');
      this.mediaRegistry.set(mediaFile.id, mediaFile);
    } catch (error) {
      console.error(`❌ [MediaServer] Failed to save metadata for ${mediaFile.id}:`, error);
      throw error;
    }
  }

  /**
   * Get media file by ID
   */
  getMediaFile(id: string): MediaFile | undefined {
    return this.mediaRegistry.get(id);
  }

  /**
   * Get all media files
   */
  getAllMediaFiles(type?: 'video' | 'image'): MediaFile[] {
    const files = Array.from(this.mediaRegistry.values());
    return type ? files.filter(f => f.type === type) : files;
  }

  /**
   * Serve video file with range request support
   */
  serveVideo(req: http.IncomingMessage, res: http.ServerResponse, videoId: string): void {
    const mediaFile = this.mediaRegistry.get(videoId);
    if (!mediaFile || mediaFile.type !== 'video') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Video not found' }));
      return;
    }

    const videoPath = path.join(serverDir, mediaFile.filePath);
    
    if (!fs.existsSync(videoPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Video file not found on disk' }));
      return;
    }

    const stat = statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set CORS headers
    const headers: { [key: string]: string } = {
      'Content-Type': mediaFile.mimeType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    };

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = createReadStream(videoPath, { start, end });

      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
      headers['Content-Length'] = chunksize.toString();
      res.writeHead(206, headers);
      file.pipe(res);
    } else {
      headers['Content-Length'] = fileSize.toString();
      res.writeHead(200, headers);
      createReadStream(videoPath).pipe(res);
    }
  }

  /**
   * Serve image file
   */
  serveImage(req: http.IncomingMessage, res: http.ServerResponse, imageId: string): void {
    const mediaFile = this.mediaRegistry.get(imageId);
    if (!mediaFile || mediaFile.type !== 'image') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image not found' }));
      return;
    }

    const imagePath = path.join(serverDir, mediaFile.filePath);
    
    if (!fs.existsSync(imagePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image file not found on disk' }));
      return;
    }

    const stat = statSync(imagePath);
    const headers: { [key: string]: string } = {
      'Content-Type': mediaFile.mimeType || 'image/jpeg',
      'Content-Length': stat.size.toString(),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000', // 1 year cache
    };

    res.writeHead(200, headers);
    createReadStream(imagePath).pipe(res);
  }

  /**
   * Register existing media file (for migration)
   */
  registerMediaFile(
    filename: string,
    type: 'video' | 'image',
    sourcePath: string,
    metadata?: Partial<MediaFile['metadata']>
  ): MediaFile {
    const id = this.generateId();
    const ext = path.extname(filename).toLowerCase();
    const targetDir = type === 'video' ? VIDEOS_DIR : IMAGES_DIR;
    const targetPath = path.join(targetDir, filename);
    
    // Copy file to media directory
    if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`📋 [MediaServer] Copied ${type} file: ${filename}`);
    }

    const stat = fs.statSync(targetPath);
    const relativePath = path.relative(serverDir, targetPath);

    const mediaFile: MediaFile = {
      id,
      filename,
      originalFilename: filename,
      filePath: relativePath,
      fileSize: stat.size,
      mimeType: this.getMimeType(ext, type),
      type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: metadata || {}
    };

    this.saveMediaMetadata(mediaFile);
    return mediaFile;
  }

  /**
   * Generate unique ID for media file
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get MIME type from extension
   */
  private getMimeType(ext: string, type: 'video' | 'image'): string {
    const mimeTypes: { [key: string]: string } = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };
    return mimeTypes[ext.toLowerCase()] || (type === 'video' ? 'video/mp4' : 'image/jpeg');
  }

  /**
   * Get media URL
   */
  getMediaUrl(mediaId: string, type: 'video' | 'image'): string {
    return `${this.config.baseUrl}/${type}/${mediaId}`;
  }

  /**
   * Migrate videos from old location
   */
  async migrateVideosFromLibrary(): Promise<number> {
    const oldVideosDir = path.join(serverDir, 'data', 'videos');
    const libraryJsonPath = path.join(oldVideosDir, 'library.json');
    
    if (!fs.existsSync(libraryJsonPath)) {
      console.log(`⚠️ [MediaServer] Library.json not found, skipping migration`);
      return 0;
    }

    try {
      const libraryContent = fs.readFileSync(libraryJsonPath, 'utf-8');
      const library = JSON.parse(libraryContent);
      const videos = library.videos || [];
      
      let migrated = 0;
      for (const video of videos) {
        const sourcePath = path.join(oldVideosDir, video.filename);
        if (fs.existsSync(sourcePath)) {
          this.registerMediaFile(video.filename, 'video', sourcePath, {
            duration: video.duration,
            codec: video.codec,
            width: video.resolution_width,
            height: video.resolution_height
          });
          migrated++;
        }
      }
      
      console.log(`✅ [MediaServer] Migrated ${migrated} videos from library.json`);
      return migrated;
    } catch (error) {
      console.error(`❌ [MediaServer] Failed to migrate videos:`, error);
      return 0;
    }
  }
}

// Export singleton instance
export const mediaServer = new MediaServer();

