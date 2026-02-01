# Server IP Provisioning Guide

## Current Situation

Your server is **running** on port 3000 (confirmed by netstat), but the IP `50.76.0.85:3000` is not accessible from the web browser.

## Server IP Provisioning Difficulty: **EASY to MEDIUM**

### Option 1: Use Localhost (Easiest - for local development)
- **Difficulty**: ⭐ Very Easy
- **Setup**: Already working locally
- **Use**: `http://localhost:3000` when testing on the same machine
- **Limitation**: Only works on the same computer

### Option 2: Use Local Network IP (Easy - for same network)
- **Difficulty**: ⭐⭐ Easy
- **Steps**:
  1. Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
  2. Look for IPv4 address (usually 192.168.x.x or 10.x.x.x)
  3. Update `mobile/src/services/api-base.ts` with that IP
  4. Ensure mobile device and server are on same WiFi network
- **Use**: `http://192.168.1.100:3000` (example)
- **Limitation**: Only works on same local network

### Option 3: Public IP / Domain (Medium - for remote access)
- **Difficulty**: ⭐⭐⭐ Medium
- **Steps**:
  1. **Get a static IP or domain**:
     - Cloud providers (AWS, Azure, GCP): Easy, ~$5-20/month
     - VPS providers (DigitalOcean, Linode): Easy, ~$5-10/month
     - Dynamic DNS (No-IP, DuckDNS): Free, but requires setup
  2. **Configure firewall**: Open port 3000
  3. **Update server binding**: Ensure server listens on `0.0.0.0` (already done ✅)
  4. **Update mobile app**: Use the public IP/domain
- **Use**: `http://your-domain.com:3000` or `http://123.45.67.89:3000`
- **Benefit**: Works from anywhere

### Option 4: Tunneling Services (Easy - for testing)
- **Difficulty**: ⭐⭐ Easy
- **Services**:
  - **ngrok**: `ngrok http 3000` → gives you `https://abc123.ngrok.io`
  - **Cloudflare Tunnel**: Free, more permanent
  - **localtunnel**: `npx localtunnel --port 3000`
- **Use**: Use the provided URL in mobile app
- **Benefit**: Works immediately, no server config needed

## Current Issue: IP 50.76.0.85

The IP `50.76.0.85` appears to be:
- Either a **public IP** that's not properly configured
- Or a **private IP** that's not accessible from your browser
- Or **firewall blocked**

### Quick Fixes:

1. **For Local Development**:
   - Use `localhost:3000` when testing on web
   - Use your local network IP (from `ipconfig`) for mobile devices

2. **For Remote Access**:
   - Use a tunneling service (ngrok) for quick testing
   - Or set up proper public IP/domain with firewall rules

3. **Check Firewall**:
   ```powershell
   # Windows - Allow port 3000
   netsh advfirewall firewall add rule name="Node.js Server" dir=in action=allow protocol=TCP localport=3000
   ```

## Recommended Approach

For **development**: Use localhost or local network IP
For **production**: Use a cloud provider with static IP/domain

