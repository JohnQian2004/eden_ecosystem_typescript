/**
 * Autobiography Service
 * Manages autobiography and white paper content with LLM enhancement
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const COHERE_API_KEY = "tHJAN4gUTZ4GM1IJ25FQFbKydqBp6LCVbsAxXggB";
const COHERE_API_HOST = "api.cohere.ai";

/**
 * Call Cohere API (wrapper for translation and enhancement)
 */
async function callCohereAPI(
  messages: Array<{ role: string; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  } = {}
): Promise<string> {
  // Convert messages to Cohere format
  const chatHistory: Array<{ role: string; message: string }> = [];
  let currentMessage = "";
  let preamble = "";
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "system") {
      preamble += (preamble ? "\n\n" : "") + msg.content;
    } else if (i === messages.length - 1 && msg.role === "user") {
      currentMessage = msg.content;
    } else {
      const role = msg.role === "assistant" ? "CHATBOT" : "USER";
      chatHistory.push({ role, message: msg.content });
    }
  }
  
  const requestBody: any = {
    message: currentMessage,
    model: options.model || "command-r7b-12-2024",
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 1000
  };
  
  if (chatHistory.length > 0) {
    requestBody.chat_history = chatHistory;
  }
  
  if (preamble) {
    requestBody.preamble = preamble;
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: COHERE_API_HOST,
        port: 443,
        path: '/v1/chat',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COHERE_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      },
      (res: any) => {
        let data = "";
        res.on("data", (c: any) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error || parsed.message) {
              reject(new Error(parsed.error?.message || parsed.message || "Cohere API error"));
              return;
            }
            const content = parsed.text || parsed.message || parsed.content;
            if (!content) {
              reject(new Error(`No content in Cohere response: ${JSON.stringify(parsed).substring(0, 200)}`));
              return;
            }
            resolve(content);
          } catch (err: any) {
            reject(new Error(`Failed to parse Cohere response: ${err.message}`));
          }
        });
      }
    );
    
    req.on("error", (err: any) => {
      reject(err);
    });
    
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

export interface AutobiographyPost {
  id: string;
  title: string;
  content: string;
  author: string;
  created_utc: number;
  category: 'autobiography' | 'white_paper';
  order: number;
  originalRedditId?: string;
  originalRedditUrl?: string;
  translatedContent?: {
    chinese?: string;
    english?: string;
  };
  lastModified?: string;
  version?: string;
}

export interface AutobiographyData {
  version: string;
  lastUpdated: string;
  posts: AutobiographyPost[];
}

const AUTOBIOGRAPHY_FILE = 'autobiography_v2.6.json';
const WHITE_PAPER_FILE = 'garden_of_eden_white_paper_v2.6.json';

// Determine data directory (same logic as other services)
let projectRoot = __dirname;
const normalizedDir = projectRoot.replace(/\\/g, '/');
if (normalizedDir.endsWith('/src/autobiography')) {
  projectRoot = path.dirname(path.dirname(projectRoot));
} else if (normalizedDir.endsWith('/dist/src/autobiography')) {
  projectRoot = path.dirname(path.dirname(path.dirname(projectRoot)));
} else {
  projectRoot = path.dirname(path.dirname(__dirname));
}

const dataDir = path.join(projectRoot, 'data', 'autobiography');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`📁 [AutobiographyService] Created data directory: ${dataDir}`);
}

const autobiographyPath = path.join(dataDir, AUTOBIOGRAPHY_FILE);
const whitePaperPath = path.join(dataDir, WHITE_PAPER_FILE);

/**
 * Load autobiography posts
 */
export function loadAutobiography(): AutobiographyData {
  try {
    if (fs.existsSync(autobiographyPath)) {
      const content = fs.readFileSync(autobiographyPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error: any) {
    console.error(`❌ [AutobiographyService] Error loading autobiography:`, error.message);
  }
  
  return {
    version: '2.6',
    lastUpdated: new Date().toISOString(),
    posts: []
  };
}

/**
 * Load white paper posts
 */
export function loadWhitePaper(): AutobiographyData {
  try {
    if (fs.existsSync(whitePaperPath)) {
      const content = fs.readFileSync(whitePaperPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error: any) {
    console.error(`❌ [AutobiographyService] Error loading white paper:`, error.message);
  }
  
  return {
    version: '2.6',
    lastUpdated: new Date().toISOString(),
    posts: []
  };
}

/**
 * Enhance and format content using LLM
 */
async function enhanceContentWithLLM(content: string, category: 'autobiography' | 'white_paper'): Promise<string> {
  const systemPrompt = category === 'autobiography'
    ? `You are an expert editor helping to enhance and format Bill Draper's autobiography content. 
Improve clarity, flow, and readability while preserving the original meaning and voice. 
Format the text with proper paragraphs, structure, and professional writing style.`
    : `You are an expert technical writer helping to enhance and format the Garden of Eden white paper content.
Improve clarity, technical accuracy, and professional presentation while preserving all technical details.
Format with proper sections, subsections, and technical documentation style.`;

  const userPrompt = `Please enhance and format the following content:\n\n${content}`;

  try {
    const enhanced = await callCohereAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      model: 'command-r7b-12-2024',
      temperature: 0.7,
      max_tokens: 2000
    });
    
    return enhanced.trim();
  } catch (error: any) {
    console.error(`❌ [AutobiographyService] LLM enhancement failed:`, error.message);
    // Return original content if enhancement fails
    return content;
  }
}

/**
 * Translate content using Cohere LLM
 */
export async function translateContent(
  content: string,
  targetLanguage: 'chinese' | 'english'
): Promise<string> {
  const systemPrompt = targetLanguage === 'chinese'
    ? 'You are a professional translator. Translate the following English text to Chinese (Simplified). Maintain the original meaning, tone, and style.'
    : 'You are a professional translator. Translate the following Chinese text to English. Maintain the original meaning, tone, and style.';

  const userPrompt = `Translate the following text to ${targetLanguage}:\n\n${content}`;

  try {
    const translated = await callCohereAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      model: 'command-r7b-12-2024',
      temperature: 0.3, // Lower temperature for more accurate translation
      max_tokens: 2000
    });
    
    return translated.trim();
  } catch (error: any) {
    console.error(`❌ [AutobiographyService] Translation failed:`, error.message);
    throw error;
  }
}

/**
 * Save autobiography posts with LLM enhancement
 */
export async function saveAutobiography(posts: AutobiographyPost[]): Promise<void> {
  // Enhance each post with LLM
  console.log(`📝 [AutobiographyService] Enhancing ${posts.length} autobiography posts with LLM...`);
  
  const enhancedPosts = await Promise.all(
    posts.map(async (post, index) => {
      console.log(`📝 [AutobiographyService] Enhancing post ${index + 1}/${posts.length}: ${post.title}`);
      const enhancedContent = await enhanceContentWithLLM(post.content, 'autobiography');
      return {
        ...post,
        content: enhancedContent,
        lastModified: new Date().toISOString(),
        version: '2.6'
      };
    })
  );
  
  const data: AutobiographyData = {
    version: '2.6',
    lastUpdated: new Date().toISOString(),
    posts: enhancedPosts
  };
  
  fs.writeFileSync(autobiographyPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ [AutobiographyService] Saved ${enhancedPosts.length} autobiography posts to ${autobiographyPath}`);
}

/**
 * Save white paper posts with LLM enhancement
 */
export async function saveWhitePaper(posts: AutobiographyPost[]): Promise<void> {
  // Enhance each post with LLM
  console.log(`📝 [AutobiographyService] Enhancing ${posts.length} white paper posts with LLM...`);
  
  const enhancedPosts = await Promise.all(
    posts.map(async (post, index) => {
      console.log(`📝 [AutobiographyService] Enhancing post ${index + 1}/${posts.length}: ${post.title}`);
      const enhancedContent = await enhanceContentWithLLM(post.content, 'white_paper');
      return {
        ...post,
        content: enhancedContent,
        lastModified: new Date().toISOString(),
        version: '2.6'
      };
    })
  );
  
  const data: AutobiographyData = {
    version: '2.6',
    lastUpdated: new Date().toISOString(),
    posts: enhancedPosts
  };
  
  fs.writeFileSync(whitePaperPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ [AutobiographyService] Saved ${enhancedPosts.length} white paper posts to ${whitePaperPath}`);
}

