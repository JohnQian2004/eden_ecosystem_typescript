# Eden Media Server

A dedicated TypeScript media server for handling videos and images in the Eden ecosystem.

## Features

- **Video Streaming**: Stream videos with HTTP range request support for seeking
- **Image Serving**: Serve images with proper caching headers
- **File Management**: Organized storage structure for videos, images, and thumbnails
- **Metadata Management**: JSON-based metadata storage for all media files
- **Migration Tools**: Scripts to migrate existing videos/images from the main server
- **Standalone Service**: Runs independently on its own port

## Installation

```bash
cd media-server
npm install
```

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Migration

The media server expects videos and images to be in `data/videos` and `data/images` directories.

To register existing files:

```bash
# Scan and register all existing files in data/videos and data/images
npm run migrate

# Or specify custom source path (if files are elsewhere)
npx ts-node src/scripts/migrate.ts /path/to/server
```

The migration script will:
1. Scan `data/videos` and `data/images` in the media-server directory
2. Register all found files without copying (since they're already in the right place)
3. Optionally migrate from other locations if specified

## Configuration

The media server runs on port 3001 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=3002 npm run dev
```

## API Endpoints

### Video Endpoints
- `GET /api/media/video/:id` - Stream video file with range support
- `GET /api/media/list?type=video` - List all videos

### Image Endpoints
- `GET /api/media/image/:id` - Serve stored image file
- `GET /api/media/image?random=999999` - Generate random image (uses seed for consistency)
- `GET /api/media/image/ai?text=sky` - Generate AI image using Cohere/text-to-image API
- `GET /api/media/list?type=image` - List all stored images

### Metadata Endpoints
- `GET /api/media/:id` - Get media file metadata

### Health Check
- `GET /health` - Server health status

## Directory Structure

```
media-server/
├── data/
│   ├── videos/          # Video files (.mp4, .webm, etc.)
│   ├── images/          # Image files (.jpg, .png, etc.)
│   ├── thumbnails/     # Generated thumbnails
│   └── metadata/        # JSON metadata files (one per media file)
├── src/
│   ├── index.ts         # Main server entry point
│   ├── mediaServer.ts   # Core media server class
│   ├── routes/          # Express routes
│   └── scripts/         # Migration scripts
└── dist/                # Compiled output
```

## Integration with Main Server

The media server runs independently. The main server can proxy requests to it or clients can connect directly.

### Option 1: Direct Connection
Clients connect directly to the media server:
```
http://localhost:3001/api/media/video/:id
```

### Option 2: Proxy Through Main Server
The main server can proxy requests:
```typescript
// In main server
app.get('/api/media/*', (req, res) => {
  // Proxy to media server
  http.get(`http://localhost:3001${req.path}`, (response) => {
    response.pipe(res);
  });
});
```

## Environment Variables

- `PORT` - Server port (default: 3001)
- `MEDIA_BASE_DIR` - Base directory for media files (default: ./data)
- `COHERE_API_KEY` - Cohere API key for AI image generation (optional)
- `HUGGINGFACE_API_KEY` - Hugging Face API key for image generation (optional, fallback)
- `REPLICATE_API_KEY` - Replicate API key for image generation (optional, fallback)
- `IMAGE_MODEL` - Hugging Face model to use (default: stabilityai/stable-diffusion-2-1)

## License

ISC

