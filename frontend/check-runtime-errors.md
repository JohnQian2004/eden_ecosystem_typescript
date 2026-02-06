# Debugging Angular Page Not Loading

## Step-by-Step Debugging

### 1. Check Browser Console
Open DevTools (F12) → Console tab and look for:
- Red error messages
- Failed module imports
- Bootstrap errors
- Any Angular-related errors

### 2. Check Network Tab
Open DevTools (F12) → Network tab:
- Look for failed requests (red status codes)
- Check if `main.js`, `polyfills.js`, `runtime.js` are loading (status 200)
- Check if any files return 404

### 3. Verify Build Output
```bash
cd frontend
dir dist\eden-sim-frontend
```
Should see:
- index.html
- main.js (should be > 0 bytes)
- polyfills.js
- runtime.js
- styles.css
- vendor.js

### 4. Check for Runtime Errors
Add this to `src/main.ts` temporarily to see bootstrap errors:

```typescript
platformBrowserDynamic().bootstrapModule(AppModule)
  .then(() => {
    console.log('✅ Angular app bootstrapped successfully');
  })
  .catch(err => {
    console.error('❌ Bootstrap error:', err);
    // Show error on page
    document.body.innerHTML = `
      <div style="padding: 20px; background: #f44336; color: white;">
        <h1>Bootstrap Error</h1>
        <pre>${err.message}\n${err.stack}</pre>
      </div>
    `;
  });
```

### 5. Common Issues

#### Issue: Blank white page
- **Cause**: JavaScript error preventing bootstrap
- **Fix**: Check browser console for errors

#### Issue: "Cannot find module" errors
- **Cause**: Missing dependencies or circular imports
- **Fix**: Run `npm install` and check imports

#### Issue: "Zone.js is required" error
- **Cause**: Missing polyfills
- **Fix**: Check `angular.json` has `polyfills: ["zone.js"]`

#### Issue: CSP (Content Security Policy) blocking scripts
- **Cause**: CSP in index.html too restrictive
- **Fix**: Check CSP meta tag in index.html

#### Issue: Base href mismatch
- **Cause**: Wrong base href in index.html
- **Fix**: Should be `<base href="/">` for dev server

### 6. Quick Test
Try accessing the page directly:
```
http://localhost:4200/
http://0.0.0.0:4200/
https://localhost:4200/ (if using SSL)
```

### 7. Check Angular Serve Output
Look for these messages in terminal:
- ✅ "Compiled successfully"
- ✅ "Local: http://localhost:4200/"
- ❌ Any error messages

### 8. Nuclear Option - Complete Reset
```bash
cd frontend
# Clean everything
rmdir /s /q node_modules
rmdir /s /q dist
rmdir /s /q .angular
npm cache clean --force

# Reinstall
npm install

# Rebuild
npm run build

# Start
npm run start:http
```

### 9. Check for TypeScript Errors
Even if build "succeeds", there might be runtime errors:
```bash
cd frontend
npx ng build --configuration development 2>&1 | Select-String -Pattern "error|Error" -Context 2
```

### 10. Verify Bootstrap Component
Check that `HomeComponent` exists and is properly exported:
- File: `src/app/home.component.ts`
- Should have `@Component` decorator
- Should be in `app.module.ts` declarations
- Should be in `app.module.ts` bootstrap array

