import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

// Suppress browser extension errors
window.addEventListener('error', (event: ErrorEvent) => {
  if (event.message && (
    event.message.includes('solana') || 
    event.message.includes('Solana') ||
    event.filename?.includes('solana')
  )) {
    event.preventDefault();
  }
}, true);

platformBrowserDynamic().bootstrapModule(AppModule)
  .then(() => {
    console.log('✅ [Bootstrap] Angular app bootstrapped successfully');
  })
  .catch(err => {
    // Always log bootstrap errors - they're critical
    console.error('❌ [Bootstrap] Failed to bootstrap Angular app:', err);
    console.error('❌ [Bootstrap] Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      cause: err.cause
    });
    
    // Show error on page so user can see what went wrong
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #f44336; color: white; padding: 20px; z-index: 99999; font-family: monospace;';
    errorDiv.innerHTML = `
      <h2>❌ Angular Bootstrap Error</h2>
      <p><strong>Message:</strong> ${err.message || 'Unknown error'}</p>
      <details>
        <summary>Stack Trace (click to expand)</summary>
        <pre style="background: rgba(0,0,0,0.3); padding: 10px; overflow: auto; max-height: 400px;">${err.stack || 'No stack trace available'}</pre>
      </details>
      <p><small>Check browser console (F12) for more details</small></p>
    `;
    document.body.appendChild(errorDiv);
  });

