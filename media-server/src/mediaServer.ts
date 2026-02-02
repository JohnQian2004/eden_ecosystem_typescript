/**
 * Media Server - Core service for managing and serving media files
 */

import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, statSync } from 'fs';

// Determine project root directory
let projectRoot = __dirname;
const normalizedDir = projectRoot.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src')) {
  projectRoot = path.dirname(projectRoot);
} else if (normalizedDir.endsWith('/dist/src')) {
  projectRoot = path.dirname(path.dirname(projectRoot));
}

// Media storage paths - using data/images and data/videos as specified
const MEDIA_BASE_DIR = path.join(projectRoot, 'data');
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
  baseUrl?: string;
  maxFileSize?: number;
  allowedVideoFormats?: string[];
  allowedImageFormats?: string[];
}

const DEFAULT_CONFIG: Required<MediaServerConfig> = {
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
    
    // Optionally scan and register existing files on startup
    // This can be disabled if you prefer manual registration
    if (process.env.AUTO_SCAN_ON_STARTUP === 'true') {
      this.scanAndRegisterExistingFiles();
    }
  }

  /**
   * Load media registry from metadata files
   */
  private loadMediaRegistry(): void {
    try {
      if (!fs.existsSync(METADATA_DIR)) {
        console.log(`📁 [MediaServer] Metadata directory does not exist, will be created on first use`);
        return;
      }

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
      ensureDirectories();
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
   * Get media file path
   */
  getMediaFilePath(mediaFile: MediaFile): string {
    return path.join(projectRoot, mediaFile.filePath);
  }

  /**
   * Serve video file with range request support
   */
  serveVideo(req: any, res: any, videoId: string): void {
    const mediaFile = this.mediaRegistry.get(videoId);
    if (!mediaFile || mediaFile.type !== 'video') {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const videoPath = this.getMediaFilePath(mediaFile);
    
    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'Video file not found on disk' });
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
  serveImage(req: any, res: any, imageId: string): void {
    const mediaFile = this.mediaRegistry.get(imageId);
    if (!mediaFile || mediaFile.type !== 'image') {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    const imagePath = this.getMediaFilePath(mediaFile);
    
    if (!fs.existsSync(imagePath)) {
      res.status(404).json({ error: 'Image file not found on disk' });
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
   * If sourcePath is in the target directory, it won't copy (just registers)
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
    
    // Only copy if source is different from target (file is in a different location)
    const sourceNormalized = path.resolve(sourcePath);
    const targetNormalized = path.resolve(targetPath);
    
    if (sourceNormalized !== targetNormalized && fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`📋 [MediaServer] Copied ${type} file: ${filename}`);
    } else if (sourceNormalized === targetNormalized) {
      console.log(`📋 [MediaServer] File already in target location, registering: ${filename}`);
    }

    // Use targetPath for registration (file should be in data/videos or data/images)
    const finalPath = fs.existsSync(targetPath) ? targetPath : sourcePath;
    const stat = fs.statSync(finalPath);
    const relativePath = path.relative(projectRoot, finalPath);

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
   * Scan and register all existing files in data/videos and data/images
   */
  scanAndRegisterExistingFiles(): { videos: number; images: number } {
    console.log('🔍 [MediaServer] Scanning existing files in data/videos and data/images...');
    
    let videosRegistered = 0;
    let imagesRegistered = 0;

    // Scan videos directory
    if (fs.existsSync(VIDEOS_DIR)) {
      const videoFiles = fs.readdirSync(VIDEOS_DIR).filter(f => 
        this.config.allowedVideoFormats.includes(path.extname(f).toLowerCase())
      );
      
      for (const filename of videoFiles) {
        const filePath = path.join(VIDEOS_DIR, filename);
        // Check if already registered
        const existing = Array.from(this.mediaRegistry.values()).find(
          m => m.filename === filename && m.type === 'video'
        );
        
        if (!existing) {
          try {
            this.registerMediaFile(filename, 'video', filePath);
            videosRegistered++;
          } catch (error: any) {
            console.error(`❌ [MediaServer] Failed to register video ${filename}:`, error.message);
          }
        }
      }
    }

    // Scan images directory
    if (fs.existsSync(IMAGES_DIR)) {
      const imageFiles = fs.readdirSync(IMAGES_DIR).filter(f => 
        this.config.allowedImageFormats.includes(path.extname(f).toLowerCase())
      );
      
      for (const filename of imageFiles) {
        const filePath = path.join(IMAGES_DIR, filename);
        // Check if already registered
        const existing = Array.from(this.mediaRegistry.values()).find(
          m => m.filename === filename && m.type === 'image'
        );
        
        if (!existing) {
          try {
            this.registerMediaFile(filename, 'image', filePath);
            imagesRegistered++;
          } catch (error: any) {
            console.error(`❌ [MediaServer] Failed to register image ${filename}:`, error.message);
          }
        }
      }
    }

    console.log(`✅ [MediaServer] Registered ${videosRegistered} videos and ${imagesRegistered} images`);
    return { videos: videosRegistered, images: imagesRegistered };
  }

  /**
   * Migrate videos from old location (from main server)
   */
  async migrateVideosFromLibrary(sourceServerPath?: string): Promise<number> {
    // If source path provided, use it; otherwise try to find the main server
    let oldVideosDir: string;
    
    if (sourceServerPath) {
      oldVideosDir = path.join(sourceServerPath, 'data', 'videos');
    } else {
      // Try to find the main server directory (one level up from media-server)
      const parentDir = path.dirname(projectRoot);
      oldVideosDir = path.join(parentDir, 'server', 'data', 'videos');
    }
    
    const libraryJsonPath = path.join(oldVideosDir, 'library.json');
    
    if (!fs.existsSync(libraryJsonPath)) {
      console.log(`⚠️ [MediaServer] Library.json not found at ${libraryJsonPath}, skipping migration`);
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

