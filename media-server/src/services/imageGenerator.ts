/**
 * Image Generator Service
 * Handles random image generation and AI image generation via Cohere
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { CohereClient } from 'cohere-ai';

export interface ImageGenerationOptions {
  text?: string;
  random?: string | number;
  width?: number;
  height?: number;
  style?: string;
}

export class ImageGenerator {
  private cohereClient: CohereClient | null = null;
  private cohereApiKey: string | null = null;
  private cacheDir: string;

  constructor() {
    // Initialize Cohere client with hardcoded API key
    this.cohereApiKey = "tHJAN4gUTZ4GM1IJ25FQFbKydqBp6LCVbsAxXggB";
    if (this.cohereApiKey) {
      this.cohereClient = new CohereClient({
        token: this.cohereApiKey,
      });
      console.log('✅ [ImageGenerator] Cohere client initialized');
    } else {
      console.warn('⚠️ [ImageGenerator] Cohere API key not available, AI image generation disabled');
    }

    // Set up cache directory
    let projectRoot = __dirname;
    const normalizedDir = projectRoot.replace(/\\/g, '/');
    if (normalizedDir.endsWith('/src/services')) {
      projectRoot = path.dirname(path.dirname(projectRoot));
    } else if (normalizedDir.endsWith('/dist/src/services')) {
      projectRoot = path.dirname(path.dirname(path.dirname(projectRoot)));
    }
    this.cacheDir = path.join(projectRoot, 'data', 'cache', 'generated-images');
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate a random image
   * Uses the random parameter as a seed for consistent random images
   */
  async generateRandomImage(random: string | number): Promise<Buffer> {
    const seed = typeof random === 'string' ? parseInt(random, 10) || 0 : random;
    
    // Use a placeholder service for random images
    // You can replace this with any random image API (e.g., Picsum, Unsplash, etc.)
    const imageUrl = `https://picsum.photos/seed/${seed}/800/600`;
    
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error(`❌ [ImageGenerator] Failed to fetch random image:`, error);
      throw new Error('Failed to generate random image');
    }
  }

  /**
   * Generate AI image using Cohere (for prompt enhancement) + image generation API
   */
  async generateAIImage(text: string, options?: { width?: number; height?: number }): Promise<Buffer> {
    try {
      // Cache disabled - always generate new images
      console.log(`🎨 [ImageGenerator] Generating AI image for: ${text}`);
      
      // Step 1: Use Cohere to enhance the prompt (if available)
      let enhancedPrompt = text;
      if (this.cohereClient && this.cohereApiKey) {
        try {
          enhancedPrompt = await this.enhancePromptWithCohere(text);
          console.log(`✨ [ImageGenerator] Enhanced prompt: ${enhancedPrompt}`);
        } catch (error) {
          console.warn(`⚠️ [ImageGenerator] Cohere prompt enhancement failed, using original:`, error);
        }
      }
      
      // Step 2: Generate image using text-to-image API
      console.log(`🖼️ [ImageGenerator] Calling image generation API with enhanced prompt...`);
      const imageData = await this.generateImageViaAPI(enhancedPrompt, options);

      // Cache disabled - do not cache images
      console.log(`✅ [ImageGenerator] Successfully generated image (not cached)`);

      return imageData;
    } catch (error: any) {
      console.error(`❌ [ImageGenerator] Failed to generate AI image:`, error);
      console.log(`🔄 [ImageGenerator] Falling back to placeholder image...`);
      
      // Fallback to placeholder if generation fails
      return await this.generatePlaceholderImage(text);
    }
  }

  /**
   * Enhance prompt using Cohere Chat API (migrated from deprecated Generate API)
   */
  private async enhancePromptWithCohere(text: string): Promise<string> {
    if (!this.cohereClient) {
      return text;
    }

    try {
      const response = await this.cohereClient.chat({
        message: `Enhance this image generation prompt to be more detailed and descriptive: "${text}". Return only the enhanced prompt, no explanations.`,
        model: 'command-r7b-12-2024',
        maxTokens: 100,
        temperature: 0.7
      });

      // Extract the enhanced prompt from Cohere's chat response
      const enhanced = response.text?.trim() || text;
      return enhanced || text;
    } catch (error) {
      console.warn(`⚠️ [ImageGenerator] Cohere prompt enhancement failed:`, error);
      return text; // Return original if enhancement fails
    }
  }

  /**
   * Generate image via external API (Hugging Face, Replicate, or similar)
   */
  private async generateImageViaAPI(text: string, options?: { width?: number; height?: number }): Promise<Buffer> {
    // Option 1: Use Hugging Face API (free tier available)
    const hfApiKey = process.env.HUGGINGFACE_API_KEY;
    if (hfApiKey) {
      try {
        console.log(`🤗 [ImageGenerator] Attempting Hugging Face API...`);
        const model = process.env.IMAGE_MODEL || 'stabilityai/stable-diffusion-2-1';
        const response = await axios.post(
          `https://api-inference.huggingface.co/models/${model}`,
          {
            inputs: text,
            parameters: {
              width: options?.width || 800,
              height: options?.height || 600
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${hfApiKey}`,
              'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: 30000 // 30 seconds for image generation
          }
        );
        
        console.log(`✅ [ImageGenerator] Hugging Face API success`);
        return Buffer.from(response.data);
      } catch (error: any) {
        console.warn(`⚠️ [ImageGenerator] Hugging Face API failed:`, error.message);
      }
    } else {
      console.log(`ℹ️ [ImageGenerator] HUGGINGFACE_API_KEY not set, skipping Hugging Face API`);
    }

    // Option 2: Use Replicate API (if configured)
    const replicateApiKey = process.env.REPLICATE_API_KEY;
    if (replicateApiKey) {
      try {
        console.log(`🔄 [ImageGenerator] Attempting Replicate API...`);
        const response = await axios.post(
          'https://api.replicate.com/v1/predictions',
          {
            version: 'stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf',
            input: {
              prompt: text,
              width: options?.width || 800,
              height: options?.height || 600
            }
          },
          {
            headers: {
              'Authorization': `Token ${replicateApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // Poll for result
        const predictionId = response.data.id;
        console.log(`⏳ [ImageGenerator] Polling Replicate prediction ${predictionId}...`);
        let result = null;
        let attempts = 0;
        while (!result && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const statusResponse = await axios.get(
            `https://api.replicate.com/v1/predictions/${predictionId}`,
            {
              headers: { 'Authorization': `Token ${replicateApiKey}` }
            }
          );
          
          if (statusResponse.data.status === 'succeeded') {
            result = statusResponse.data.output[0];
            break;
          } else if (statusResponse.data.status === 'failed') {
            throw new Error('Image generation failed');
          }
          attempts++;
        }

        if (result) {
          console.log(`✅ [ImageGenerator] Replicate API success, downloading image...`);
          const imageResponse = await axios.get(result, { responseType: 'arraybuffer' });
          return Buffer.from(imageResponse.data);
        }
      } catch (error: any) {
        console.warn(`⚠️ [ImageGenerator] Replicate API failed:`, error.message);
      }
    } else {
      console.log(`ℹ️ [ImageGenerator] REPLICATE_API_KEY not set, skipping Replicate API`);
    }

    // Fallback to placeholder
    console.log(`📝 [ImageGenerator] Using placeholder image service...`);
    return await this.generatePlaceholderImage(text);
  }

  /**
   * Generate placeholder image (fallback)
   */
  private async generatePlaceholderImage(text: string): Promise<Buffer> {
    // Use a placeholder service that generates images from text
    // You can use services like:
    // - DALL-E API
    // - Stable Diffusion API
    // - Or a simple placeholder service
    
    // For now, use a simple text-based placeholder
    const placeholderUrl = `https://via.placeholder.com/800x600/4CAF50/FFFFFF?text=${encodeURIComponent(text)}`;
    
    try {
      const response = await axios.get(placeholderUrl, {
        responseType: 'arraybuffer',
        timeout: 5000
      });
      return Buffer.from(response.data);
    } catch (error) {
      // Ultimate fallback: create a simple colored image
      return this.createSimpleImage(text);
    }
  }

  /**
   * Create a simple colored image as ultimate fallback
   */
  private createSimpleImage(text: string): Buffer {
    // Create a simple SVG image
    const svg = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#4CAF50"/>
        <text x="400" y="300" font-family="Arial" font-size="24" fill="white" text-anchor="middle">${text}</text>
      </svg>
    `;
    return Buffer.from(svg);
  }

  /**
   * Get cache key for image
   */
  private getCacheKey(text: string, options?: { width?: number; height?: number }): string {
    const optionsStr = options ? `_${options.width || 800}x${options.height || 600}` : '';
    const hash = this.simpleHash(text + optionsStr);
    return `${hash}.png`;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached image if exists
   */
  private getCachedImage(cacheKey: string): Buffer | null {
    const cachePath = path.join(this.cacheDir, cacheKey);
    if (fs.existsSync(cachePath)) {
      try {
        return fs.readFileSync(cachePath);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  /**
   * Cache generated image
   */
  private cacheImage(cacheKey: string, imageData: Buffer): void {
    const cachePath = path.join(this.cacheDir, cacheKey);
    try {
      fs.writeFileSync(cachePath, imageData);
    } catch (error) {
      console.warn(`⚠️ [ImageGenerator] Failed to cache image:`, error);
    }
  }
}

// Export singleton instance
export const imageGenerator = new ImageGenerator();

