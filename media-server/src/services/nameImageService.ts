/**
 * Name-based Image Service
 * Fetches images from Pexels/Unsplash based on name and caches them
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Pexels API key (from old codebase)
const PEXELS_API_KEY = 'JUYmQ211edAwWqlCsB0DXQQoPOmyx7e6Jx1uH5Es6NN04ZjszIwN0sOW';

// Determine project root directory
let projectRoot = __dirname;
const normalizedDir = projectRoot.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src/services')) {
  projectRoot = path.dirname(path.dirname(projectRoot));
} else if (normalizedDir.endsWith('/dist/src/services')) {
  projectRoot = path.dirname(path.dirname(path.dirname(projectRoot)));
}

const IMAGES_DIR = path.join(projectRoot, 'data', 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

export interface NameImageResult {
  filename: string;
  filePath: string;
  source: 'pexels' | 'unsplash' | 'cached';
  buffer: Buffer;
}

export class NameImageService {
  /**
   * Get image by name (with caching)
   * Checks cache first, then fetches from Pexels/Unsplash if not found
   */
  async getImageByName(name: string): Promise<NameImageResult> {
    // Normalize name (lowercase, remove special chars)
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `${normalizedName}.jpeg`;
    const filePath = path.join(IMAGES_DIR, filename);

    // Check cache first
    if (fs.existsSync(filePath)) {
      console.log(`✅ [NameImageService] Found cached image for "${name}": ${filename}`);
      const buffer = fs.readFileSync(filePath);
      return {
        filename,
        filePath,
        source: 'cached',
        buffer,
      };
    }

    // Cache not found - fetch from external sources
    console.log(`🔍 [NameImageService] Cached image not found for "${name}", fetching from external sources...`);

    let lastError: Error | null = null;

    // Try Pexels first (optional - if it fails, continue to Unsplash)
    try {
      console.log(`📸 [NameImageService] Attempting to fetch from Pexels for "${name}"...`);
      const pexelsResult = await this.fetchFromPexels(name);
      if (pexelsResult && pexelsResult.buffer) {
        // Save to cache
        fs.writeFileSync(filePath, pexelsResult.buffer);
        console.log(`✅ [NameImageService] Successfully fetched and cached Pexels image: ${filename}`);
        return {
          ...pexelsResult,
          filePath,
        };
      } else {
        console.log(`⚠️ [NameImageService] Pexels returned no results for "${name}", trying Unsplash...`);
      }
    } catch (error: any) {
      console.warn(`⚠️ [NameImageService] Pexels fetch failed for "${name}":`, error.message);
      lastError = error;
      // Continue to Unsplash - don't fail yet
    }

    // Always try Unsplash if cache not found (even if Pexels succeeded but returned no results)
    try {
      console.log(`📸 [NameImageService] Attempting to fetch from Unsplash for "${name}"...`);
      const unsplashResult = await this.fetchFromUnsplash(name);
      if (unsplashResult && unsplashResult.buffer) {
        // Save to cache
        fs.writeFileSync(filePath, unsplashResult.buffer);
        console.log(`✅ [NameImageService] Successfully fetched and cached Unsplash image: ${filename}`);
        return {
          ...unsplashResult,
          filePath,
        };
      } else {
        console.warn(`⚠️ [NameImageService] Unsplash returned no results for "${name}"`);
      }
    } catch (error: any) {
      console.error(`❌ [NameImageService] Unsplash fetch failed for "${name}":`, error.message);
      lastError = error;
    }

    // If we get here, both Pexels and Unsplash failed
    const errorMessage = lastError 
      ? `Failed to fetch image for "${name}" from Pexels or Unsplash: ${lastError.message}`
      : `Failed to fetch image for "${name}" from Pexels or Unsplash (no results found)`;
    throw new Error(errorMessage);
  }

  /**
   * Fetch image from Pexels API
   */
  private async fetchFromPexels(query: string): Promise<NameImageResult | null> {
    const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
    const headers = { Authorization: PEXELS_API_KEY };

    try {
      const response = await axios.get(pexelsUrl, { headers, timeout: 10000 });
      
      if (response.status === 200 && response.data.photos && response.data.photos.length > 0) {
        const imageUrl = response.data.photos[0].src.original;
        console.log(`📸 [NameImageService] Found Pexels image: ${imageUrl}`);
        
        // Download the image
        const imgResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });

        if (imgResponse.status === 200) {
          const buffer = Buffer.from(imgResponse.data);
          const normalizedName = query.toLowerCase().replace(/[^a-z0-9]/g, '-');
          return {
            filename: `${normalizedName}.jpeg`,
            filePath: '', // Will be set by caller
            source: 'pexels',
            buffer,
          };
        }
      }
    } catch (error: any) {
      console.error(`❌ [NameImageService] Pexels API error:`, error.message);
    }

    return null;
  }

  /**
   * Fetch image from Unsplash
   * Always tries to fetch - this is the primary fallback when cache is not found
   */
  private async fetchFromUnsplash(query: string): Promise<NameImageResult | null> {
    // Use source.unsplash.com with a random signature to avoid caching
    const sig = Math.floor(Math.random() * 900000) + 100000;
    const unsplashUrl = `https://source.unsplash.com/800x600/?${encodeURIComponent(query)}&sig=${sig}`;

    console.log(`🔗 [NameImageService] Unsplash URL: ${unsplashUrl.replace(/sig=\d+/, 'sig=***')}`);

    try {
      const response = await axios.get(unsplashUrl, {
        maxRedirects: 5,
        timeout: 15000, // Increased timeout for Unsplash
        responseType: 'arraybuffer',
        validateStatus: (status) => status >= 200 && status < 400, // Accept redirects
      });

      if (response.status >= 200 && response.status < 300) {
        const contentType = response.headers['content-type'] || '';
        const contentLength = response.data?.length || 0;
        
        console.log(`📥 [NameImageService] Unsplash response: status=${response.status}, content-type=${contentType}, size=${contentLength} bytes`);
        
        // Accept any image type, not just JPEG
        if (contentType.includes('image/') && contentLength > 0) {
          const buffer = Buffer.from(response.data);
          const normalizedName = query.toLowerCase().replace(/[^a-z0-9]/g, '-');
          console.log(`✅ [NameImageService] Successfully fetched Unsplash image for "${query}" (${contentLength} bytes)`);
          return {
            filename: `${normalizedName}.jpeg`,
            filePath: '', // Will be set by caller
            source: 'unsplash',
            buffer,
          };
        } else {
          console.warn(`⚠️ [NameImageService] Unsplash returned invalid content type or empty response: ${contentType}, size=${contentLength}`);
        }
      } else {
        console.warn(`⚠️ [NameImageService] Unsplash returned status ${response.status}`);
      }
    } catch (error: any) {
      console.error(`❌ [NameImageService] Unsplash fetch error for "${query}":`, error.message);
      if (error.response) {
        console.error(`   Response status: ${error.response.status}`);
        console.error(`   Response headers:`, error.response.headers);
      }
    }

    // Return null if we reach here (no image found or error occurred)
    return null;
  }

  /**
   * Get Picsum random image
   */
  async getPicsumImage(): Promise<Buffer> {
    const url = 'https://picsum.photos/800/600';
    
    try {
      const response = await axios.get(url, {
        maxRedirects: 5,
        timeout: 10000,
        responseType: 'arraybuffer',
      });

      if (response.status === 200) {
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
          return Buffer.from(response.data);
        }
      }
    } catch (error: any) {
      console.error(`❌ [NameImageService] Picsum fetch error:`, error.message);
    }

    throw new Error('Failed to fetch Picsum image');
  }
}

// Export singleton instance
export const nameImageService = new NameImageService();

