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
   * Sync library.json - Scan videos directory and merge extra ones into library.json
   */
  async syncLibrary(): Promise<{
    added: number;
    updated: number;
    removed: number;
    analyzed: number;
    errors: string[];
  }> {
    const libraryPath = path.join(MEDIA_BASE_DIR, 'library.json');
    const result = {
      added: 0,
      updated: 0,
      removed: 0,
      analyzed: 0,
      errors: [] as string[]
    };

    console.log(`🔄 [MediaServer] Starting library sync...`);
    console.log(`   Library path: ${libraryPath}`);
    console.log(`   Videos directory: ${VIDEOS_DIR}`);

    try {
      // Step 1: Load existing library.json
      let library: any = {
        videos: [],
        tags: [],
        metadata: {
          version: "1.0",
          last_updated: new Date().toISOString(),
          total_videos: 0
        }
      };

      if (fs.existsSync(libraryPath)) {
        try {
          const libraryContent = fs.readFileSync(libraryPath, 'utf-8');
          library = JSON.parse(libraryContent);
          console.log(`   ✅ Loaded existing library: ${library.videos?.length || 0} videos`);
        } catch (err: any) {
          console.error(`   ❌ Failed to parse library.json:`, err.message);
          result.errors.push(`Failed to parse library.json: ${err.message}`);
        }
      } else {
        console.log(`   ⚠️ Library.json not found, creating new one`);
      }

      // Ensure structure
      if (!library.videos) library.videos = [];
      if (!library.tags) library.tags = [];
      if (!library.metadata) library.metadata = {};

      // Step 2: Scan videos directory to get all video files
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
      let videoFilesInDirectory: string[] = [];

      if (fs.existsSync(VIDEOS_DIR)) {
        const files = fs.readdirSync(VIDEOS_DIR);
        videoFilesInDirectory = files.filter(file => {
          const ext = path.extname(file).toLowerCase();
          return videoExtensions.includes(ext);
        });
        console.log(`   📹 Found ${videoFilesInDirectory.length} video files in directory`);
      } else {
        console.log(`   ⚠️ Videos directory not found: ${VIDEOS_DIR}`);
        result.errors.push(`Videos directory not found: ${VIDEOS_DIR}`);
        return result;
      }

      // Step 3: Create helper function to find video in library by filename or originalFilename
      const findVideoInLibrary = (filename: string): any => {
        return library.videos.find((v: any) => 
          v.filename === filename || v.originalFilename === filename
        );
      };

      console.log(`   📚 Library.json has ${library.videos.length} video entries`);

      // Step 4: Compare directory files with library.json entries
      // Find videos in directory that are NOT in library.json (these need to be added)
      const videosToAdd: string[] = [];
      const videosToUpdate: string[] = [];

      for (const filename of videoFilesInDirectory) {
        const filePath = path.join(VIDEOS_DIR, filename);
        const stats = fs.statSync(filePath);
        
        const existingVideo = findVideoInLibrary(filename);
        
        if (!existingVideo) {
          // Video exists in directory but NOT in library.json - needs to be added
          videosToAdd.push(filename);
          console.log(`   ➕ Will add: ${filename} (not in library.json)`);
        } else {
          // Video exists in both - check if needs update
          if (existingVideo.file_size !== stats.size) {
            videosToUpdate.push(filename);
            console.log(`   🔄 Will update: ${filename} (size changed: ${existingVideo.file_size} -> ${stats.size})`);
          }
        }
      }

      // Step 5: Add missing videos to library.json
      for (const filename of videosToAdd) {
        try {
          const filePath = path.join(VIDEOS_DIR, filename);
          const stats = fs.statSync(filePath);

          // Try to find metadata file
          const metadataFile = path.join(METADATA_DIR, `${filename.replace(/\.[^/.]+$/, '')}.json`);
          let mediaMetadata: any = null;
          if (fs.existsSync(metadataFile)) {
            try {
              mediaMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
            } catch (err: any) {
              console.warn(`   ⚠️ Failed to load metadata for ${filename}: ${err.message}`);
            }
          }

          // Create new video entry
          const videoId = mediaMetadata?.id || `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          const newVideo: any = {
            id: videoId,
            filename: filename,
            originalFilename: filename,
            file_path: `media/videos/${filename}`,
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

          // Merge into library.json
          library.videos.push(newVideo);
          result.added++;
          console.log(`   ✅ Added to library.json: ${filename}`);
        } catch (error: any) {
          const errorMsg = `Error adding ${filename}: ${error.message}`;
          result.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}`);
        }
      }

      // Step 6: Update existing videos in library.json
      for (const filename of videosToUpdate) {
        try {
          const filePath = path.join(VIDEOS_DIR, filename);
          const stats = fs.statSync(filePath);
          
          const videoIndex = library.videos.findIndex((v: any) => 
            v.filename === filename || v.originalFilename === filename
          );
          
          if (videoIndex !== -1) {
            library.videos[videoIndex].file_size = stats.size;
            library.videos[videoIndex].updated_at = new Date().toISOString();
            
            // Set default author if missing
            if (!library.videos[videoIndex].author) {
              library.videos[videoIndex].author = 'root GOD bill.draper.auto@gmail.com (bill draper)';
            }
            
            result.updated++;
            console.log(`   ✅ Updated in library.json: ${filename}`);
          }
        } catch (error: any) {
          const errorMsg = `Error updating ${filename}: ${error.message}`;
          result.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}`);
        }
      }

      // Step 7: Remove videos from library.json that no longer exist in directory
      const videosInDirectorySet = new Set(videoFilesInDirectory);
      const videosToRemove: any[] = [];
      
      for (const video of library.videos) {
        const filename = video.filename;
        const originalFilename = video.originalFilename || video.filename;
        
        // Check if neither filename nor originalFilename exists in directory
        if (!videosInDirectorySet.has(filename) && !videosInDirectorySet.has(originalFilename)) {
          videosToRemove.push(video);
          console.log(`   ➖ Will remove: ${video.filename} (file not in directory)`);
        }
      }

      if (videosToRemove.length > 0) {
        for (const video of videosToRemove) {
          library.videos = library.videos.filter((v: any) => v.id !== video.id);
          result.removed++;
          console.log(`   ✅ Removed from library.json: ${video.filename}`);
        }
      }

      // Step 8: Remove duplicate entries from library.json (same filename or originalFilename)
      const seenFilenames = new Set<string>();
      const seenIds = new Set<string>();
      const uniqueVideos: any[] = [];
      let duplicateCount = 0;
      
      for (const video of library.videos) {
        const filename = video.filename;
        const originalFilename = video.originalFilename || video.filename;
        const key = `${filename}|${originalFilename}`;
        
        // Skip if we've seen this filename/originalFilename combination or this ID
        if (seenFilenames.has(filename) || seenFilenames.has(originalFilename) || seenIds.has(video.id)) {
          duplicateCount++;
          console.log(`   🗑️ Removing duplicate: ${video.filename} (ID: ${video.id})`);
          continue;
        }
        
        seenFilenames.add(filename);
        if (originalFilename !== filename) {
          seenFilenames.add(originalFilename);
        }
        seenIds.add(video.id);
        uniqueVideos.push(video);
      }
      
      if (duplicateCount > 0) {
        library.videos = uniqueVideos;
        console.log(`   🧹 Removed ${duplicateCount} duplicate entries from library.json`);
      }

      // Step 9: Migration - Set default author for all videos that don't have one
      let authorMigrationCount = 0;
      for (const video of library.videos) {
        if (!video.author) {
          video.author = 'root GOD bill.draper.auto@gmail.com (bill draper)';
          video.updated_at = new Date().toISOString();
          authorMigrationCount++;
        }
      }
      if (authorMigrationCount > 0) {
        console.log(`   📝 Set default author for ${authorMigrationCount} existing video(s)`);
      }

      // Step 9: Update library metadata
      library.metadata.last_updated = new Date().toISOString();
      library.metadata.total_videos = library.videos.length;
      if (!library.metadata.version) library.metadata.version = "1.0";

      // Step 10: Save library.json
      fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2), 'utf-8');
      console.log(`   💾 Library.json saved with ${library.videos.length} videos`);

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

