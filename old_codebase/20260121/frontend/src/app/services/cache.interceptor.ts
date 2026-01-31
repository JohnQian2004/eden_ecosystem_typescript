import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpResponse, HttpEvent } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

/**
 * HTTP Interceptor for caching service registry requests
 * Caches responses in localStorage to improve performance on remote servers
 */
@Injectable()
export class CacheInterceptor implements HttpInterceptor {
  private readonly CACHE_PREFIX = 'eden_cache_';
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
  private readonly CACHEABLE_URLS = [
    '/api/root-ca/service-registry',
    '/api/gardens'
  ];

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Only cache GET requests to specific endpoints
    if (req.method !== 'GET' || !this.isCacheableUrl(req.url)) {
      return next.handle(req);
    }

    // Check for cache-busting header or query parameter
    const cacheBust = req.headers.get('X-Cache-Bust') === 'true' || 
                      (req.url.includes('?') && req.url.includes('_cacheBust=true'));
    
    if (cacheBust) {
      // Clear cache for this URL and proceed with fresh request
      const cacheKey = this.getCacheKey(req.url);
      localStorage.removeItem(cacheKey);
      console.log(`🔄 [Cache] Cache-bust requested for ${req.url}`);
    } else {
      // Try to get cached response
      const cachedResponse = this.getCachedResponse(req.url);
      if (cachedResponse) {
        const ageSeconds = Math.round((Date.now() - cachedResponse.timestamp) / 1000);
        console.log(`💾 [Cache] Serving cached response for ${req.url} (age: ${ageSeconds}s)`);
        return of(new HttpResponse({
          status: 200,
          body: cachedResponse.data,
          headers: cachedResponse.headers
        }));
      }
    }

    // If not cached, make the request and cache the response
    return next.handle(req).pipe(
      tap(event => {
        if (event instanceof HttpResponse) {
          this.cacheResponse(req.url, event);
        }
      }),
      catchError(error => {
        // On error, try to serve stale cache if available
        const staleCache = this.getStaleCache(req.url);
        if (staleCache) {
          console.log(`⚠️ [Cache] Serving stale cache due to error for ${req.url}`);
          return of(new HttpResponse({
            status: 200,
            body: staleCache.data,
            headers: staleCache.headers
          }));
        }
        throw error;
      })
    );
  }

  private isCacheableUrl(url: string): boolean {
    return this.CACHEABLE_URLS.some(cacheableUrl => url.includes(cacheableUrl));
  }

  private getCacheKey(url: string): string {
    // Include query parameters in cache key to handle different filters
    return `${this.CACHE_PREFIX}${btoa(url).replace(/[+/=]/g, '')}`;
  }

  private getCachedResponse(url: string): { data: any; headers: any; timestamp: number } | null {
    try {
      const cacheKey = this.getCacheKey(url);
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) {
        return null;
      }

      const parsed = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;

      // Check if cache is still valid
      if (age < this.CACHE_DURATION) {
        return parsed;
      }

      // Cache expired, but keep it for stale-while-revalidate
      return null;
    } catch (error) {
      console.warn(`⚠️ [Cache] Error reading cache for ${url}:`, error);
      return null;
    }
  }

  private getStaleCache(url: string): { data: any; headers: any; timestamp: number } | null {
    try {
      const cacheKey = this.getCacheKey(url);
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) {
        return null;
      }

      const parsed = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;

      // Serve stale cache if less than 2x cache duration (60 minutes total)
      if (age < this.CACHE_DURATION * 2) {
        return parsed;
      }

      // Too old, remove it
      localStorage.removeItem(cacheKey);
      return null;
    } catch (error) {
      return null;
    }
  }

  private cacheResponse(url: string, response: HttpResponse<any>): void {
    try {
      const cacheKey = this.getCacheKey(url);
      const cacheData: { data: any; headers: { [key: string]: any }; timestamp: number } = {
        data: response.body,
        headers: {},
        timestamp: Date.now()
      };

      // Store relevant headers
      response.headers.keys().forEach(key => {
        const values = response.headers.getAll(key);
        if (values) {
          cacheData.headers[key] = values.length === 1 ? values[0] : values;
        }
      });

      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      console.log(`💾 [Cache] Cached response for ${url}`);
    } catch (error) {
      // Handle quota exceeded or other storage errors
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn(`⚠️ [Cache] Storage quota exceeded, clearing old cache entries`);
        this.clearOldCacheEntries();
        // Try again after clearing
        try {
          const cacheKey = this.getCacheKey(url);
          const cacheData = {
            data: response.body,
            headers: {},
            timestamp: Date.now()
          };
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (retryError) {
          console.warn(`⚠️ [Cache] Failed to cache after clearing:`, retryError);
        }
      } else {
        console.warn(`⚠️ [Cache] Error caching response for ${url}:`, error);
      }
    }
  }

  private clearOldCacheEntries(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          try {
            const cached = localStorage.getItem(key);
            if (cached) {
              const parsed = JSON.parse(cached);
              const age = Date.now() - parsed.timestamp;
              // Remove entries older than 2x cache duration
              if (age > this.CACHE_DURATION * 2) {
                keysToRemove.push(key);
              }
            }
          } catch (e) {
            // Invalid cache entry, remove it
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log(`🧹 [Cache] Cleared ${keysToRemove.length} old cache entries`);
    } catch (error) {
      console.warn(`⚠️ [Cache] Error clearing old cache entries:`, error);
    }
  }

  /**
   * Clear cache for a specific URL or all cache
   */
  static clearCache(url?: string): void {
    try {
      const prefix = 'eden_cache_';
      if (url) {
        const cacheKey = `${prefix}${btoa(url).replace(/[+/=]/g, '')}`;
        localStorage.removeItem(cacheKey);
        console.log(`🧹 [Cache] Cleared cache for ${url}`);
      } else {
        // Clear all cache entries
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`🧹 [Cache] Cleared all cache entries (${keysToRemove.length} entries)`);
      }
    } catch (error) {
      console.warn(`⚠️ [Cache] Error clearing cache:`, error);
    }
  }
}
