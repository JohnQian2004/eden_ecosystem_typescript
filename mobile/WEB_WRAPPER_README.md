# Expo Web Wrapper for Eden Angular App

This Expo app wraps the Angular web application running on the server, providing a native mobile experience while loading the full web app.

## Setup

1. **Install dependencies:**
   ```bash
   cd mobile
   npm install
   ```

2. **Install WebView package:**
   ```bash
   npm install react-native-webview
   ```

3. **Start the Expo app:**
   ```bash
   npm start
   ```

## Configuration

The web wrapper is configured to load the Angular app from:
- **Server URL:** `https://50.76.0.85:3000/app`

This URL is set in `mobile/src/screens/WebWrapperScreen.tsx`:
```typescript
const SERVER_URL = 'https://50.76.0.85:3000/app';
```

## Features

- **WebView Integration:** Loads the Angular app in a native WebView
- **Navigation Controls:** Back button and reload functionality
- **Error Handling:** Displays error messages and retry options
- **Loading States:** Shows loading indicator while the app loads
- **HTTPS Support:** Handles self-signed certificates for development

## Usage

1. Ensure the server is running on `https://50.76.0.85:3000`
2. The Angular app should be accessible at `/app` route
3. Launch the Expo app - it will automatically load the web app

## Troubleshooting

### Certificate Errors
If you see certificate errors, ensure:
- The server certificates include the IP address `50.76.0.85`
- Certificates are regenerated with the correct IP (run `regenerate-certs.bat`)

### Connection Issues
- Verify the server is running and accessible
- Check firewall settings allow connections to port 3000
- Ensure the server is bound to `0.0.0.0` (not just `localhost`)

### WebView Not Loading
- Check that `react-native-webview` is installed
- For iOS, you may need to add WebView permissions in `app.json`
- For Android, ensure internet permissions are set

## File Structure

- `mobile/src/screens/WebWrapperScreen.tsx` - Main web wrapper component
- `mobile/src/navigation/AppNavigator.tsx` - Navigation with WebWrapper as Home tab
- `mobile/App.tsx` - App entry point

## Notes

- The web wrapper loads the full Angular application
- Mobile responsive detection in Angular will show the mobile home component automatically
- All Angular features work within the WebView
- WebSocket connections and API calls work normally

