# HTTPS Setup for Mobile App

The server uses HTTPS with self-signed certificates. The mobile app needs to be configured to connect to the HTTPS server.

## Server Certificate Setup

1. **Regenerate certificates with server IP**:
   ```bash
   cd server
   set SERVER_IP=50.76.0.85
   node scripts/generate-pki-certs.js
   ```
   
   Or use the batch script:
   ```bash
   cd mobile
   regenerate-certs.bat
   ```

2. **Trust the CA certificate**:
   - Windows: Double-click `server/certs/ca-cert.pem` and install it in "Trusted Root Certification Authorities"
   - macOS: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain server/certs/ca-cert.pem`
   - Linux: `sudo cp server/certs/ca-cert.pem /usr/local/share/ca-certificates/eden-ca.crt && sudo update-ca-certificates`

## Mobile App Configuration

The mobile app is configured to use HTTPS in `mobile/src/services/api-base.ts`:
- `USE_HTTPS = true`
- `SERVER_IP = '50.76.0.85'`
- `SERVER_PORT = '3000'`

## React Native Certificate Handling

For React Native (iOS/Android), self-signed certificates may cause issues. Options:

### Option 1: Trust the CA Certificate (Recommended for Development)
- iOS: Install the CA certificate on the device/simulator
- Android: Install the CA certificate in system trust store

### Option 2: Disable SSL Verification (Development Only)
For development, you can configure React Native to accept self-signed certificates. However, this is **NOT recommended for production**.

## Expo Web

For Expo web, the browser will handle certificate validation. If you see certificate warnings:
1. Trust the CA certificate in your browser
2. Or access the server via `https://50.76.0.85:3000` and accept the certificate warning

## Testing

1. Start the server with HTTPS:
   ```bash
   cd server
   npx tsx eden-sim-redis.ts --enable-https=true --deployed-as-root=true
   ```

2. Start the mobile app:
   ```bash
   cd mobile
   npm start
   ```

3. Test the connection:
   - The app should connect to `https://50.76.0.85:3000`
   - Check the console for any certificate errors

## Troubleshooting

### Certificate Errors
- **Error: "NET::ERR_CERT_AUTHORITY_INVALID"**
  - Solution: Trust the CA certificate (see above)

- **Error: "Certificate doesn't match hostname"**
  - Solution: Regenerate certificates with the correct IP address using `regenerate-certs.bat`

### Connection Refused
- Ensure server is running on `0.0.0.0:3000` (not just `localhost`)
- Check firewall settings
- Verify the server IP is correct in `api-base.ts`

