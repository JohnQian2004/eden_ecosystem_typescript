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
   * Generate ETag from file stats (mtime + size)
   */
  private generateETag(stat: fs.Stats): string {
    const mtime = stat.mtime.getTime().toString(36);
    const size = stat.size.toString(36);
    return `"${mtime}-${size}"`;
  }

  /**
   * Check if request has matching ETag (304 Not Modified)
   */
  private checkETag(req: any, etag: string): boolean {
    const ifNoneMatch = req.headers['if-none-match'];
    return ifNoneMatch === etag || ifNoneMatch === `W/${etag}`;
  }

  /**
   * Serve video file with range request support
   * Follows Eden backend pattern: look up by ID in library.json or Redis, then serve file directly
   */
  async serveVideo(req: any, res: any, videoId: string): Promise<void> {
    console.log(`📹 [MediaServer] serveVideo called with videoId: ${videoId}`);
    
    // First, try to find video in registry (for uploaded videos)
    let mediaFile = this.mediaRegistry.get(videoId);
    
    // If not in registry, look up by ID in Redis or library.json
    if (!mediaFile || mediaFile.type !== 'video') {
      console.log(`📹 [MediaServer] Video not in registry, checking Redis and library.json...`);
      
      let video: any = null;
      
      // Try Redis first (if available)
      try {
        const videoLibraryRedis = require('./services/videoLibraryRedisService');
        const redisVideo = await videoLibraryRedis.getVideoById(videoId);
        if (redisVideo) {
          console.log(`✅ [MediaServer] Found video in Redis: ${redisVideo.filename || videoId}`);
          video = redisVideo;
        }
      } catch (error: any) {
        console.log(`📹 [MediaServer] Redis not available or error: ${error.message}`);
      }
      
      // Fallback to library.json if not found in Redis
      if (!video) {
        const videos = this.getVideosFromLibrary();
        console.log(`📹 [MediaServer] Loaded ${videos.length} videos from library.json`);
        
        // Try to find video by ID first, then by filename
        video = videos.find((v: any) => v.id === videoId || v.filename === videoId);
      }
      
      // If not found in Redis/library.json, check directory directly
      if (!video) {
        console.log(`📹 [MediaServer] Video not in Redis/library.json, checking directory...`);
        const videoPath = path.join(VIDEOS_DIR, videoId);
        // Also try with filename if videoId doesn't have extension
        const videoPathWithExt = videoId.includes('.') ? videoPath : path.join(VIDEOS_DIR, `${videoId}.mp4`);
        
        // Try both paths
        let actualVideoPath: string | null = null;
        if (fs.existsSync(videoPath)) {
          actualVideoPath = videoPath;
        } else if (fs.existsSync(videoPathWithExt)) {
          actualVideoPath = videoPathWithExt;
        } else {
          // Try to find by matching filename in directory
          if (fs.existsSync(VIDEOS_DIR)) {
            const videoFiles = fs.readdirSync(VIDEOS_DIR).filter(f => 
              this.config.allowedVideoFormats.includes(path.extname(f).toLowerCase())
            );
            // Check if any filename matches (with or without extension)
            const matchingFile = videoFiles.find(f => 
              f === videoId || f === `${videoId}.mp4` || f.replace(/\.(mp4|mov|avi|mkv|webm)$/i, '') === videoId
            );
            if (matchingFile) {
              actualVideoPath = path.join(VIDEOS_DIR, matchingFile);
            }
          }
        }
        
        if (actualVideoPath && fs.existsSync(actualVideoPath)) {
          // Video exists in directory, create a minimal video object
          const stat = fs.statSync(actualVideoPath);
          const filename = path.basename(actualVideoPath);
          video = {
            id: videoId,
            filename: filename,
            file_path: `videos/${filename}`,
            file_size: stat.size
          };
          console.log(`✅ [MediaServer] Found video in directory: ${filename}`);
        } else {
          console.error(`❌ [MediaServer] Video not found in Redis, library.json, or directory: ${videoId}`);
          res.writeHead(404, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ 
            error: 'Video not found',
            videoId: videoId,
            message: 'This video is not in the library. Please refresh the video listings.'
          }));
          return;
        }
      }
      
      console.log(`✅ [MediaServer] Found video: ${video.filename}`);
      
      // Determine the correct base directory (following Eden pattern)
      let mediaServerDir = projectRoot;
      const normalized = mediaServerDir.replace(/\\/g, '/');
      if (normalized.endsWith('/media-server')) {
        mediaServerDir = path.dirname(mediaServerDir);
      }
      // If we're in a compiled output (dist/build), go up to media-server/
      if (mediaServerDir.endsWith(path.sep + 'dist') || mediaServerDir.endsWith(path.sep + 'build')) {
        mediaServerDir = path.dirname(mediaServerDir);
      }
      
      // Try media server's videos directory first
      let videoPath = path.join(mediaServerDir, 'media-server', 'data', 'videos', video.filename);
      let videoExists = fs.existsSync(videoPath);
      console.log(`📹 [MediaServer] Checking media server directory: ${videoPath} (exists: ${videoExists})`);
      
      // If not found, try the VIDEOS_DIR path (relative to projectRoot)
      if (!videoExists) {
        videoPath = path.join(VIDEOS_DIR, video.filename);
        videoExists = fs.existsSync(videoPath);
        console.log(`📹 [MediaServer] Checking VIDEOS_DIR: ${videoPath} (exists: ${videoExists})`);
      }
      
      // If still not found, try Eden backend's videos directory as fallback
      if (!videoExists) {
        const edenVideoPath = path.join(mediaServerDir, 'server', 'data', 'videos', video.filename);
        console.log(`📹 [MediaServer] Checking Eden backend directory: ${edenVideoPath}`);
        if (fs.existsSync(edenVideoPath)) {
          videoPath = edenVideoPath;
          videoExists = true;
          console.log(`✅ [MediaServer] Found video in Eden backend directory: ${video.filename}`);
        }
      }
      
      if (!videoExists) {
        console.error(`❌ [MediaServer] Video file not found: ${video.filename}`);
        res.writeHead(404, { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
          error: 'Video file not found',
          filename: video.filename,
          message: 'This video file no longer exists. Please refresh the video listings.'
        }));
        return;
      }
      
      // Security: Ensure the resolved path is within the data directory
      const resolvedPath = path.resolve(videoPath);
      const dataDir = path.resolve(path.join(mediaServerDir, 'media-server', 'data'));
      const edenDataDir = path.resolve(path.join(mediaServerDir, 'server', 'data'));
      if (!resolvedPath.startsWith(dataDir) && !resolvedPath.startsWith(edenDataDir)) {
        console.log(`🚫 [MediaServer] Forbidden video access attempt: ${videoId}`);
        res.writeHead(403, { 
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        });
        res.end('Forbidden');
        return;
      }
      
      // Use the path that actually exists
      const actualVideoPath = resolvedPath;
      console.log(`📹 [MediaServer] Serving video: ${video.filename} from ${actualVideoPath}`);
      
      // Check file access
      try {
        fs.accessSync(actualVideoPath, fs.constants.F_OK);
      } catch (err: any) {
        console.error(`❌ [MediaServer] Video file access error: ${actualVideoPath}`);
        res.writeHead(404, { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: 'Video not found' }));
        return;
      }
      
      const stat = statSync(actualVideoPath);
      const fileSize = stat.size;
      console.log(`📹 [MediaServer] Video file size: ${fileSize} bytes`);
      
      // Warn if file is very small (likely a placeholder or corrupted)
      if (stat.size < 1000) {
        console.warn(`⚠️ [MediaServer] Warning: Video file is very small (${stat.size} bytes) - may be a placeholder or corrupted`);
      }
      
      // Generate ETag for cache validation
      const etag = this.generateETag(stat);
      
      // Check if client has cached version (304 Not Modified)
      if (req.method === 'GET' && this.checkETag(req, etag)) {
        res.writeHead(304, {
          'ETag': etag,
          'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
          'Access-Control-Allow-Origin': '*',
        });
        res.end();
        return;
      }
      
      // Set appropriate headers for video streaming (following Eden pattern)
      const range = req.headers.range;
      const headers: { [key: string]: string } = {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'ETag': etag,
        'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache for videos
        'Last-Modified': stat.mtime.toUTCString(),
      };
      
      if (range) {
        // Handle range requests for video seeking
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = createReadStream(actualVideoPath, { start, end });
        
        headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
        headers['Content-Length'] = chunksize.toString();
        res.writeHead(206, headers);
        file.pipe(res);
      } else {
        headers['Content-Length'] = fileSize.toString();
        res.writeHead(200, headers);
        createReadStream(actualVideoPath).pipe(res);
      }
      
      return;
    }
    
    // If video was found in registry, serve it using the existing logic
    const finalVideoPath = mediaFile.filePath && path.isAbsolute(mediaFile.filePath)
      ? mediaFile.filePath
      : path.join(VIDEOS_DIR, mediaFile.filename);
    
    console.log(`📹 [MediaServer] Resolved video path: ${finalVideoPath}`);
    
    if (!fs.existsSync(finalVideoPath)) {
      console.error(`❌ [MediaServer] Video file not found: ${finalVideoPath}`);
      res.writeHead(404, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Video file not found on disk' }));
      return;
    }

    const stat = statSync(finalVideoPath);
    const fileSize = stat.size;
    console.log(`📹 [MediaServer] Video file size: ${fileSize} bytes`);
    
    if (fileSize < 1024) {
      console.warn(`⚠️ [MediaServer] Warning: Video file is very small (${fileSize} bytes), may be corrupted or incomplete`);
    }
    
    // Generate ETag for cache validation
    const etag = this.generateETag(stat);
    
    // Check if client has cached version (304 Not Modified)
    if (req.method === 'GET' && this.checkETag(req, etag)) {
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
        'Access-Control-Allow-Origin': '*',
      });
      res.end();
      return;
    }
    
    const range = req.headers.range;
    const headers: { [key: string]: string } = {
      'Content-Type': mediaFile.mimeType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'ETag': etag,
      'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache for videos
      'Last-Modified': stat.mtime.toUTCString(),
    };

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = createReadStream(finalVideoPath, { start, end });

      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
      headers['Content-Length'] = chunksize.toString();
      res.writeHead(206, headers);
      file.pipe(res);
    } else {
      headers['Content-Length'] = fileSize.toString();
      res.writeHead(200, headers);
      createReadStream(finalVideoPath).pipe(res);
    }
  }

  /**
   * Serve image file
   */
  serveImage(req: any, res: any, imageId: string): void {
    console.log(`🖼️ [MediaServer] serveImage called with imageId: ${imageId}`);
    
    // First, try to find image in registry
    let mediaFile = this.mediaRegistry.get(imageId);
    
    if (!mediaFile || mediaFile.type !== 'image') {
      console.log(`🖼️ [MediaServer] Image not in registry: ${imageId}`);
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Image not found', imageId: imageId }));
      return;
    }

    const imagePath = this.getMediaFilePath(mediaFile);
    console.log(`🖼️ [MediaServer] Resolved image path: ${imagePath}`);
    
    if (!fs.existsSync(imagePath)) {
      console.error(`❌ [MediaServer] Image file not found on disk: ${imagePath}`);
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Image file not found on disk', imageId: imageId }));
      return;
    }

    const stat = statSync(imagePath);
    console.log(`🖼️ [MediaServer] Image file size: ${stat.size} bytes`);
    
    // Generate ETag for cache validation
    const etag = this.generateETag(stat);
    
    // Check if client has cached version (304 Not Modified)
    if (req.method === 'GET' && this.checkETag(req, etag)) {
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
        'Access-Control-Allow-Origin': '*',
      });
      res.end();
      return;
    }
    
    const headers: { [key: string]: string } = {
      'Content-Type': mediaFile.mimeType || 'image/jpeg',
      'Content-Length': stat.size.toString(),
      'Access-Control-Allow-Origin': '*',
      'ETag': etag,
      'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
      'Last-Modified': stat.mtime.toUTCString(),
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

  /**
   * Sync Redis with videos directory
   * Scans videos directory and compares with Redis, adding/updating/removing entries
   * Uses Redis as the storage backend instead of library.json
   */
  async syncLibrary(): Promise<{
    added: number;
    updated: number;
    removed: number;
    analyzed: number;
    errors: string[];
  }> {
    const videosDir = VIDEOS_DIR; // Already defined at module level
    const metadataDir = METADATA_DIR; // Already defined at module level
    
    const result = {
      added: 0,
      updated: 0,
      removed: 0,
      analyzed: 0,
      errors: [] as string[]
    };

    console.log(`🔄 [MediaServer] Starting library sync to Redis...`);
    console.log(`   Videos directory: ${videosDir}`);

    try {
      // Step 1: Check if Redis is available
      const videoLibraryRedis = require('./services/videoLibraryRedisService');
      const redisService = require('./services/redisService');
      
      if (!redisService.isRedisAvailable()) {
        const errorMsg = 'Redis is not available';
        console.error(`   ❌ ${errorMsg}`);
        result.errors.push(errorMsg);
        return result;
      }

      // Step 2: Get existing videos from Redis
      const existingVideos = await videoLibraryRedis.getAllVideos();
      console.log(`   ✅ Loaded ${existingVideos.length} existing videos from Redis`);

      // Create a map of existing videos by filename for quick lookup
      const existingVideosMap = new Map<string, any>();
      for (const video of existingVideos) {
        const filename = video.filename || video.originalFilename;
        if (filename) {
          existingVideosMap.set(filename, video);
        }
      }

      // Step 3: Scan videos directory to get all video files
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
      let videoFilesInDirectory: string[] = [];

      if (fs.existsSync(videosDir)) {
        const files = fs.readdirSync(videosDir);
        videoFilesInDirectory = files.filter(file => {
          const ext = path.extname(file).toLowerCase();
          return videoExtensions.includes(ext);
        });
        console.log(`   📹 Found ${videoFilesInDirectory.length} video files in directory`);
      } else {
        console.log(`   ⚠️ Videos directory not found: ${videosDir}`);
        result.errors.push(`Videos directory not found: ${videosDir}`);
        return result;
      }

      // Step 4: Compare directory files with Redis entries
      const videosToAdd: string[] = [];
      const videosToUpdate: string[] = [];

      for (const filename of videoFilesInDirectory) {
        const filePath = path.join(videosDir, filename);
        const stats = fs.statSync(filePath);
        
        const existingVideo = existingVideosMap.get(filename);
        
        if (!existingVideo) {
          videosToAdd.push(filename);
          console.log(`   ➕ Will add: ${filename} (not in Redis)`);
        } else {
          if (existingVideo.file_size !== stats.size) {
            videosToUpdate.push(filename);
            console.log(`   🔄 Will update: ${filename} (size changed: ${existingVideo.file_size} -> ${stats.size})`);
          }
        }
      }

      // Step 5: Add missing videos to Redis
      for (const filename of videosToAdd) {
        try {
          const filePath = path.join(videosDir, filename);
          const stats = fs.statSync(filePath);

          // Try to find metadata file
          const metadataFile = path.join(metadataDir, `${filename.replace(/\.[^/.]+$/, '')}.json`);
          let mediaMetadata: any = null;
          if (fs.existsSync(metadataFile)) {
            try {
              mediaMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
            } catch (err: any) {
              console.warn(`   ⚠️ Failed to load metadata for ${filename}: ${err.message}`);
            }
          }

          // Create new video entry
          // Use filename as ID (matches how videos are served)
          const videoId = filename;
          const newVideo: any = {
            id: videoId,
            filename: filename,
            originalFilename: filename,
            file_path: `videos/${filename}`,
            file_size: stats.size,
            created_at: mediaMetadata?.createdAt || stats.birthtime.toISOString() || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: mediaMetadata?.tags || ['video', 'media', 'upload'],
            is_new: true,
            author: 'root GOD bill.draper.auto@gmail.com (bill draper)'
          };

          // Add metadata if available
          if (mediaMetadata?.metadata) {
            newVideo.duration = mediaMetadata.metadata.duration;
            newVideo.codec = mediaMetadata.metadata.codec;
            newVideo.resolution_width = mediaMetadata.metadata.width;
            newVideo.resolution_height = mediaMetadata.metadata.height;
            newVideo.frame_rate = mediaMetadata.metadata.frame_rate;
          }

          // Save to Redis
          const saved = await videoLibraryRedis.saveVideo(newVideo);
          if (saved) {
            result.added++;
            console.log(`   ✅ Added to Redis: ${filename}`);
          } else {
            const errorMsg = `Failed to save ${filename} to Redis`;
            result.errors.push(errorMsg);
            console.error(`   ❌ ${errorMsg}`);
          }
        } catch (error: any) {
          const errorMsg = `Error adding ${filename}: ${error.message}`;
          result.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}`);
        }
      }

      // Step 6: Update existing videos in Redis
      for (const filename of videosToUpdate) {
        try {
          const filePath = path.join(videosDir, filename);
          const stats = fs.statSync(filePath);
          
          const existingVideo = existingVideosMap.get(filename);
          
          if (existingVideo) {
            // Update file size and timestamp
            existingVideo.file_size = stats.size;
            existingVideo.updated_at = new Date().toISOString();
            
            if (!existingVideo.author) {
              existingVideo.author = 'root GOD bill.draper.auto@gmail.com (bill draper)';
            }
            
            // Save updated video to Redis
            const saved = await videoLibraryRedis.saveVideo(existingVideo);
            if (saved) {
              result.updated++;
              console.log(`   ✅ Updated in Redis: ${filename}`);
            } else {
              const errorMsg = `Failed to update ${filename} in Redis`;
              result.errors.push(errorMsg);
              console.error(`   ❌ ${errorMsg}`);
            }
          }
        } catch (error: any) {
          const errorMsg = `Error updating ${filename}: ${error.message}`;
          result.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}`);
        }
      }

      // Step 7: Remove videos from Redis that no longer exist in directory
      const videosInDirectorySet = new Set(videoFilesInDirectory);
      const videosToRemove: any[] = [];
      
      for (const video of existingVideos) {
        const filename = video.filename || video.originalFilename;
        
        if (filename && !videosInDirectorySet.has(filename)) {
          videosToRemove.push(video);
          console.log(`   ➖ Will remove: ${filename} (file not in directory)`);
        }
      }

      if (videosToRemove.length > 0) {
        for (const video of videosToRemove) {
          const videoId = video.id || video.filename;
          if (videoId) {
            const deleted = await videoLibraryRedis.deleteVideo(videoId);
            if (deleted) {
              result.removed++;
              console.log(`   ✅ Removed from Redis: ${video.filename || videoId}`);
            } else {
              const errorMsg = `Failed to delete ${video.filename || videoId} from Redis`;
              result.errors.push(errorMsg);
              console.error(`   ❌ ${errorMsg}`);
            }
          }
        }
      }

      // Step 8: Set default author for all videos that don't have one
      const allVideosAfterSync = await videoLibraryRedis.getAllVideos();
      let authorMigrationCount = 0;
      for (const video of allVideosAfterSync) {
        if (!video.author) {
          video.author = 'root GOD bill.draper.auto@gmail.com (bill draper)';
          video.updated_at = new Date().toISOString();
          await videoLibraryRedis.saveVideo(video);
          authorMigrationCount++;
        }
      }
      if (authorMigrationCount > 0) {
        console.log(`   📝 Set default author for ${authorMigrationCount} existing video(s) in Redis`);
      }

      const totalInRedis = await videoLibraryRedis.getVideoCount();
      console.log(`   💾 Redis now contains ${totalInRedis} videos`);

      console.log(`   ✅ Sync completed: ${result.added} added, ${result.updated} updated, ${result.removed} removed`);
      if (result.errors.length > 0) {
        console.log(`   ⚠️ Errors: ${result.errors.length}`);
      }

      return result;
    } catch (error: any) {
      console.error(`   ❌ Sync error:`, error.message);
      result.errors.push(error.message);
      throw error;
    }
  }

  /**
   * Scan videos directory and return all video files
   * This is the primary source - scans actual files in data/videos
   * Uses filename as ID (matches how videos are served)
   */
  scanVideosDirectory(): any[] {
    const videos: any[] = [];
    
    if (!fs.existsSync(VIDEOS_DIR)) {
      console.warn(`⚠️ [MediaServer] Videos directory not found: ${VIDEOS_DIR}`);
      return videos;
    }
    
    const videoFiles = fs.readdirSync(VIDEOS_DIR).filter(f => 
      this.config.allowedVideoFormats.includes(path.extname(f).toLowerCase())
    );
    
    console.log(`📹 [MediaServer] Scanning videos directory: found ${videoFiles.length} video files`);
    
    for (const filename of videoFiles) {
      const filePath = path.join(VIDEOS_DIR, filename);
      try {
        const stat = fs.statSync(filePath);
        // Use filename as ID (this is what's used in video URLs like /api/media/video/:id)
        // The ID should match what's used when serving the video
        const videoId = filename;
        
        videos.push({
          id: videoId,
          filename: filename,
          file_path: `videos/${filename}`,
          file_size: stat.size,
          created_at: stat.birthtime.toISOString(),
          updated_at: stat.mtime.toISOString(),
          author: 'root GOD bill.draper.auto@gmail.com (bill draper)',
          tags: []
        });
      } catch (error: any) {
        console.error(`❌ [MediaServer] Failed to stat video file ${filename}:`, error.message);
      }
    }
    
    return videos;
  }

  /**
   * Get all videos from Redis (replaces library.json)
   * Falls back to library.json if Redis is not available (for migration period)
   * NOTE: This is legacy - use scanVideosDirectory() instead
   */
  getVideosFromLibrary(): any[] {
    // Try Redis first
    try {
      const videoLibraryRedis = require('./services/videoLibraryRedisService');
      // Use synchronous approach - we'll make it async later if needed
      // For now, return empty and let async methods handle it
    } catch (error) {
      // Redis service not available
    }

    // Fallback to library.json for backward compatibility during migration
    const mediaServerLibraryPath = path.join(MEDIA_BASE_DIR, 'library.json');
    let library: any = null;
    
    if (fs.existsSync(mediaServerLibraryPath)) {
      try {
        const libraryContent = fs.readFileSync(mediaServerLibraryPath, 'utf-8');
        library = JSON.parse(libraryContent);
        console.log(`📚 [MediaServer] Loaded ${library.videos?.length || 0} videos from media server library.json (fallback)`);
        return library.videos || [];
      } catch (error: any) {
        console.error(`❌ [MediaServer] Failed to read media server library.json:`, error.message);
      }
    }
    
    // Fallback: Try Eden backend's library.json files
    let edenLibraryDir = projectRoot;
    const normalized = edenLibraryDir.replace(/\\/g, '/');
    if (normalized.endsWith('/media-server')) {
      edenLibraryDir = path.dirname(edenLibraryDir);
    }
    
    // Try server/data/media/library.json first (newer location)
    const edenMediaLibraryPath = path.join(edenLibraryDir, 'server', 'data', 'media', 'library.json');
    if (fs.existsSync(edenMediaLibraryPath)) {
      try {
        const libraryContent = fs.readFileSync(edenMediaLibraryPath, 'utf-8');
        library = JSON.parse(libraryContent);
        console.log(`📚 [MediaServer] Loaded ${library.videos?.length || 0} videos from Eden media library.json (fallback)`);
        return library.videos || [];
      } catch (error: any) {
        console.error(`❌ [MediaServer] Failed to read Eden media library.json:`, error.message);
      }
    }
    
    // Try server/data/videos/library.json (older location)
    const edenVideosLibraryPath = path.join(edenLibraryDir, 'server', 'data', 'videos', 'library.json');
    if (fs.existsSync(edenVideosLibraryPath)) {
      try {
        const libraryContent = fs.readFileSync(edenVideosLibraryPath, 'utf-8');
        library = JSON.parse(libraryContent);
        console.log(`📚 [MediaServer] Loaded ${library.videos?.length || 0} videos from Eden videos library.json (fallback)`);
        return library.videos || [];
      } catch (error: any) {
        console.error(`❌ [MediaServer] Failed to read Eden videos library.json:`, error.message);
      }
    }
    
    console.warn(`⚠️ [MediaServer] No library.json found in any location`);
    return [];
  }

  /**
   * Get all videos from Redis (async version)
   */
  async getVideosFromRedis(): Promise<any[]> {
    try {
      const videoLibraryRedis = require('./services/videoLibraryRedisService');
      const videos = await videoLibraryRedis.getAllVideos();
      if (videos.length > 0) {
        console.log(`📚 [MediaServer] Loaded ${videos.length} videos from Redis`);
        return videos;
      }
    } catch (error: any) {
      console.warn(`⚠️ [MediaServer] Redis not available, falling back to library.json:`, error.message);
    }
    
    // Fallback to library.json
    return this.getVideosFromLibrary();
  }
}

