# API Configuration for Mobile App

## Automatic Server Detection

The mobile app **automatically detects** the server IP/domain without hardcoding:

- **Web Platform**: Detects from `window.location` (same as Angular frontend)
- **Native Platform**: Uses Expo Constants to detect Metro bundler hostname
- **Environment Variable**: Can override with `EXPO_PUBLIC_API_BASE_URL`

## Configuration Options (Priority Order):

1. **Runtime Override** (highest priority)
   - Can be set programmatically via `setApiBaseUrl(url)`

2. **Environment Variable**
   - Create a `.env` file in the `mobile/` directory
   - Add: `EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP_OR_DOMAIN:3000`
   - Example: `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:3000`
   - Or for production: `EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com`

3. **Auto-Detection** (default)
   - **Web**: Automatically uses `window.location.hostname:3000`
   - **Native**: Automatically detects from Expo Metro bundler hostname

## How It Works:

### Web Platform:
- If running on port 4200/19006/19000, assumes backend is on port 3000
- Otherwise uses same origin (when server serves the built app)

### Native Platform:
- Extracts hostname from Expo Constants (Metro bundler connection)
- Uses that hostname with port 3000 for API calls
- Falls back to environment variable or localhost if detection fails

## Troubleshooting:

- **"Connection failed" error**: 
  - Make sure your backend server is running on port 3000
  - Ensure your mobile device and computer are on the same WiFi network
  - Check firewall settings (port 3000 should be accessible)
  - Set `EXPO_PUBLIC_API_BASE_URL` in `.env` file as override

- **"Network request failed"**:
  - Auto-detection may have failed - set `EXPO_PUBLIC_API_BASE_URL` explicitly
  - Verify the backend server is accessible from your network
  - Try accessing `http://YOUR_IP:3000/api/chat` in a browser on your device

## Production:

For production builds, set the environment variable:
```bash
EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

Or configure it in your build system (EAS Build, CI/CD, etc.)

