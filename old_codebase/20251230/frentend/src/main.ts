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
  .catch(err => {
    // Only log non-extension errors
    if (!err.message?.includes('solana') && !err.message?.includes('Solana')) {
      console.error(err);
    }
  });

