# Media Server

A dedicated TypeScript media server for handling videos and images in the Eden ecosystem.

## Features

- **Video Serving**: Stream videos with HTTP range request support for seeking
- **Image Serving**: Serve images with proper caching headers
- **File Management**: Organized storage structure for videos, images, and thumbnails
- **Metadata Management**: JSON-based metadata storage for all media files
- **Migration Tools**: Scripts to migrate existing videos/images from old locations

## Directory Structure

```
server/data/media/
├── videos/          # Video files (.mp4, .webm, etc.)
├── images/          # Image files (.jpg, .png, etc.)
├── thumbnails/     # Generated thumbnails
└── metadata/        # JSON metadata files (one per media file)
```

## API Endpoints

### Video Endpoints
- `GET /api/media/video/:id` - Stream video file with range support
- `GET /api/media/list?type=video` - List all videos

### Image Endpoints
- `GET /api/media/image/:id` - Serve image file
- `GET /api/media/list?type=image` - List all images

### Metadata Endpoints
- `GET /api/media/:id` - Get media file metadata

## Usage

### Integration

The media server is automatically integrated into the main HTTP server. Media requests are handled before other routes.

### Migration

To migrate existing videos and images to the media server:

```bash
npm run migrate-media
```

This will:
1. Copy all videos from `server/data/videos/` to `server/data/media/videos/`
2. Copy images from various locations to `server/data/media/images/`
3. Create metadata files for all migrated media
4. Register all files in the media registry

### Programmatic Usage

```typescript
import { mediaServer } from './src/media/mediaServer';

// Get all videos
const videos = mediaServer.getAllMediaFiles('video');

// Get media file by ID
const mediaFile = mediaServer.getMediaFile('some-id');

// Get media URL
const videoUrl = mediaServer.getMediaUrl('video-id', 'video');
```

## Configuration

The media server can be configured via the `MediaServerConfig` interface:

```typescript
const mediaServer = new MediaServer({
  port: 3001,
  baseUrl: '/api/media',
  maxFileSize: 500 * 1024 * 1024, // 500MB
  allowedVideoFormats: ['.mp4', '.webm', '.mov'],
  allowedImageFormats: ['.jpg', '.png', '.gif']
});
```

## Migration from Old System

The old video serving system used:
- Storage: `server/data/videos/`
- Endpoint: `/api/movie/video/:filename`
- Metadata: `server/data/videos/library.json`

The new media server uses:
- Storage: `server/data/media/videos/` and `server/data/media/images/`
- Endpoint: `/api/media/video/:id` and `/api/media/image/:id`
- Metadata: `server/data/media/metadata/*.json`

The migration script automatically handles the transition.

