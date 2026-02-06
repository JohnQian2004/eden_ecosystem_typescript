# Troubleshooting Angular Build/Page Load Issues

## Common Issues and Solutions

### Issue: Page doesn't load after build

**Symptoms:**
- Build completes without errors
- `ng serve` starts successfully
- Browser shows blank page or errors

**Solutions:**

1. **Clear all caches:**
   ```bash
   npm run clean
   # Or manually:
   npx ng cache clean
   rmdir /s /q dist
   rmdir /s /q .angular
   ```

2. **Hard refresh browser:**
   - Chrome/Edge: `Ctrl+Shift+R` or `Ctrl+F5`
   - Firefox: `Ctrl+Shift+R`
   - Or open DevTools (F12) → Network tab → Check "Disable cache"

3. **Check browser console:**
   - Open DevTools (F12) → Console tab
   - Look for JavaScript errors
   - Check Network tab for failed requests (404, 500, etc.)

4. **Verify build output:**
   ```bash
   # Check if files exist
   dir dist\eden-sim-frontend
   # Should see: index.html, main.js, styles.css, etc.
   ```

5. **Check Angular serve output:**
   - Look for "Compiled successfully" message
   - Check for any warnings or errors in terminal
   - Verify the correct port (4200) is being used

6. **SSL Certificate Issues:**
   - If using `--ssl`, try `npm run start:http` instead
   - Or accept the self-signed certificate in browser

7. **Configuration Mismatch:**
   - Build and serve must use same configuration
   - Use `--configuration development` for both
   - Or use `--configuration production` for both

8. **Port conflicts:**
   ```bash
   # Check if port 4200 is in use
   netstat -ano | findstr :4200
   # Kill process if needed, or use different port:
   ng serve --port 4201
   ```

9. **Check base href:**
   - Verify `base href="/"` in `index.html`
   - If deploying to subdirectory, update base href

10. **Service Worker Cache (if enabled):**
    - Open DevTools → Application → Service Workers
    - Click "Unregister" if any are registered
    - Clear "Cache Storage" and "Application Cache"

### Quick Fix Script

Run this to clean everything and rebuild:
```bash
npm run clean
npm run build
npm run start:http
```

Then in browser:
1. Open DevTools (F12)
2. Go to Network tab
3. Check "Disable cache"
4. Hard refresh (Ctrl+Shift+R)

### Debug Checklist

- [ ] Build completes without errors
- [ ] `dist/eden-sim-frontend/index.html` exists
- [ ] `dist/eden-sim-frontend/main.js` exists
- [ ] Browser console shows no errors
- [ ] Network tab shows all files loading (200 status)
- [ ] No 404 errors for JS/CSS files
- [ ] Port 4200 is accessible
- [ ] Browser cache is cleared
- [ ] SSL certificate is accepted (if using HTTPS)

