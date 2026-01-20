npm --prefix C:\Projects\JohnQian2003\eden_ecosystem_typescript\desktop run build
npm --prefix C:\Projects\JohnQian2003\eden_ecosystem_typescript\desktop run dev

# Eden Simulator - Full Stack Setup Guide

## Architecture

The simulator now runs as a **pure server** that:
- Serves the Angular frontend (static files)
- Provides REST API for chat processing (`/api/chat`)
- Broadcasts real-time events via WebSocket (`/ws`)
- Processes all simulator interactions through the chat API

## Backend Setup (Server)

1. Navigate to server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Build the Angular frontend first:
```bash
cd ../frontend
npm install
ng build
cd ../server
```

4. Run the simulator server:

**Recommended: Use npm run dev (automatically kills port 3000 first)**
```bash
npm run dev
```

**Or run directly with tsx:**
```bash
# With OpenAI and deployed as root
npx tsx eden-sim-redis.ts --enable-openai=true --mocked-llm=false --deployed-as-root=true

# With OpenAI (standard mode)
npx tsx eden-sim-redis.ts --enable-openai=true --mocked-llm=false

# With DeepSeek (legacy)
npx tsx eden-sim-redis.ts --mocked-llm=false

# Mock mode (no API calls)
npx tsx eden-sim-redis.ts --mocked-llm=true
```

**Note:** If port 3000 is already in use, the `npm run dev` command will automatically kill the process on that port before starting the server.

The server will:
- Start HTTP server on port 3000
- Serve Angular frontend from `../frontend/dist/eden-sim-frontend`
- Provide API at `http://localhost:3000/api/chat`
- WebSocket at `ws://localhost:3000/ws`

## Frontend Setup (Angular)

### Development Mode (with ng serve)

If you want to run Angular separately during development:

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start Angular dev server:
```bash
ng serve
```

The frontend will be available at http://localhost:4200

**Note:** In dev mode, update `chat.service.ts` to use `http://localhost:3000/api/chat` and WebSocket to `ws://localhost:3000/ws`

### Production Mode (served by Node server)

1. Build Angular:
```bash
cd frontend
ng build
```

2. The built files will be in `frontend/dist/eden-sim-frontend/`

3. The Node server will automatically serve these files

## Usage Flow

1. **Start the server** (serves Angular + API + WebSocket)
2. **Open browser** to `http://localhost:3000`
3. **Enter query** in the chat input box (e.g., "I want a sci-fi movie to watch tonight at the best price")
4. **Click Send** - The query is sent to `/api/chat`
5. **Watch real-time updates** via WebSocket:
   - Component status changes in sidebar
   - LLM responses in chat box
   - iGas costs updated
   - All interactions displayed

## API Endpoints

### POST `/api/chat`
Processes user chat input through the simulator.

**Request:**
```json
{
  "input": "I want a sci-fi movie to watch tonight at the best price",
  "userId": "u1"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Chat processed"
}
```

### GET `/api/status`
Returns server status.

**Response:**
```json
{
  "status": "online",
  "websocketClients": 1,
  "timestamp": 1234567890
}
```

## WebSocket Events

All simulator interactions are broadcast as WebSocket events:

```typescript
{
  type: string,        // Event type (user_input, llm_response, igas, etc.)
  component: string,   // Component name (llm, service-registry, etc.)
  message: string,     // Human-readable message
  timestamp: number,   // Unix timestamp
  data?: any          // Optional event data
}
```

## Features

### Backend
- ✅ HTTP server serving Angular static files
- ✅ REST API for chat processing
- ✅ WebSocket for real-time event broadcasting
- ✅ Embedded Redis server
- ✅ OpenAI/DeepSeek LLM support
- ✅ ServiceRegistry architecture
- ✅ Mock provider APIs
- ✅ iGas calculation
- ✅ Indexer consumers

### Frontend
- ✅ Chat input form
- ✅ Real-time WebSocket connection
- ✅ Chat box showing all interactions
- ✅ Component status sidebar with indicators
- ✅ iGas display (current & total)
- ✅ Bootstrap 5 styling
- ✅ Responsive design

## Environment Variables

- `HTTP_PORT` - HTTP server port (default: 3000)
- `FRONTEND_PATH` - Path to Angular build (default: `../frontend/dist/eden-sim-frontend`)
