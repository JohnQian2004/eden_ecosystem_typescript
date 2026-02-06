/**
 * Autobiography Routes
 * Backend API routes for autobiography generator.
 * Paste flow: save to Redis (and file); no Reddit fetch or posting.
 */

import * as http from 'http';
import {
  loadAutobiography,
  loadWhitePaper,
  saveAutobiography,
  saveWhitePaper,
  writeAutobiographyData,
  writeWhitePaperData,
  translateContent,
  AutobiographyPost,
  AutobiographyData
} from './autobiographyService';

const REDIS_KEY_AUTOBIOGRAPHY = 'eden:autobiography';
const REDIS_KEY_WHITE_PAPER = 'eden:white-paper';

type RedisLike = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> } | null | undefined;

export async function handleAutobiographyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  redis?: RedisLike
): Promise<boolean> {
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const json = (status: number, body: object) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(body));
  };

  // GET /api/autobiography/reddit/posts - No longer fetches Reddit; returns empty (paste flow instead)
  if (pathname === '/api/autobiography/reddit/posts' && req.method === 'GET') {
    console.log(`📥 [${requestId}] GET /api/autobiography/reddit/posts (no Reddit; use Paste)`);
    json(200, { success: true, posts: [], count: 0 });
    return true;
  }

  // POST /api/autobiography/reddit/create - Disabled; save via Paste instead
  if (pathname === '/api/autobiography/reddit/create' && req.method === 'POST') {
    console.log(`📥 [${requestId}] POST /api/autobiography/reddit/create (disabled)`);
    json(200, { success: false, error: 'Reddit posting is disabled. Use Paste to save posts to Redis.' });
    return true;
  }

  // GET /api/autobiography/autobiography - Load from Redis first, then file
  if (pathname === '/api/autobiography/autobiography' && req.method === 'GET') {
    console.log(`📥 [${requestId}] GET /api/autobiography/autobiography`);
    try {
      let data: AutobiographyData;
      if (redis) {
        const raw = await redis.get(REDIS_KEY_AUTOBIOGRAPHY);
        if (raw) {
          data = JSON.parse(raw);
        } else {
          data = loadAutobiography();
          await redis.set(REDIS_KEY_AUTOBIOGRAPHY, JSON.stringify(data));
        }
      } else {
        data = loadAutobiography();
      }
      json(200, { success: true, data });
      console.log(`✅ [${requestId}] Returned ${data.posts.length} autobiography posts`);
      return true;
    } catch (error: any) {
      console.error(`❌ [${requestId}] Error loading autobiography:`, error.message);
      json(500, { success: false, error: error.message });
      return true;
    }
  }

  // GET /api/autobiography/white-paper - Load from Redis first, then file
  if (pathname === '/api/autobiography/white-paper' && req.method === 'GET') {
    console.log(`📥 [${requestId}] GET /api/autobiography/white-paper`);
    try {
      let data: AutobiographyData;
      if (redis) {
        const raw = await redis.get(REDIS_KEY_WHITE_PAPER);
        if (raw) {
          data = JSON.parse(raw);
        } else {
          data = loadWhitePaper();
          await redis.set(REDIS_KEY_WHITE_PAPER, JSON.stringify(data));
        }
      } else {
        data = loadWhitePaper();
      }
      json(200, { success: true, data });
      console.log(`✅ [${requestId}] Returned ${data.posts.length} white paper posts`);
      return true;
    } catch (error: any) {
      console.error(`❌ [${requestId}] Error loading white paper:`, error.message);
      json(500, { success: false, error: error.message });
      return true;
    }
  }

  // POST /api/autobiography/paste - Paste one post; save to Redis and file (no Reddit)
  if (pathname === '/api/autobiography/paste' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { title, content, category } = JSON.parse(body);
        if (!title || !content || !category) {
          json(400, { success: false, error: 'title, content, and category are required' });
          return;
        }
        if (category !== 'autobiography' && category !== 'white_paper') {
          json(400, { success: false, error: 'category must be "autobiography" or "white_paper"' });
          return;
        }
        const now = Math.floor(Date.now() / 1000);
        const id = `paste-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        // Preserve rich text exactly: do not trim content (keeps HTML, <p>, spaces, paragraphs)
        const rawContent = content != null ? String(content) : '';
        const post: AutobiographyPost = {
          id,
          title: String(title).trim(),
          content: rawContent,
          author: 'paste',
          created_utc: now,
          category,
          order: 0,
          lastModified: new Date().toISOString(),
          version: '2.6'
        };

        if (category === 'autobiography') {
          let data: AutobiographyData = { version: '2.6', lastUpdated: new Date().toISOString(), posts: [] };
          if (redis) {
            const raw = await redis.get(REDIS_KEY_AUTOBIOGRAPHY);
            if (raw) data = JSON.parse(raw);
            else data = loadAutobiography();
          } else {
            data = loadAutobiography();
          }
          post.order = data.posts.length;
          data.posts.push(post);
          data.lastUpdated = new Date().toISOString();
          if (redis) await redis.set(REDIS_KEY_AUTOBIOGRAPHY, JSON.stringify(data));
          writeAutobiographyData(data);
        } else {
          let data: AutobiographyData = { version: '2.6', lastUpdated: new Date().toISOString(), posts: [] };
          if (redis) {
            const raw = await redis.get(REDIS_KEY_WHITE_PAPER);
            if (raw) data = JSON.parse(raw);
            else data = loadWhitePaper();
          } else {
            data = loadWhitePaper();
          }
          post.order = data.posts.length;
          data.posts.push(post);
          data.lastUpdated = new Date().toISOString();
          if (redis) await redis.set(REDIS_KEY_WHITE_PAPER, JSON.stringify(data));
          writeWhitePaperData(data);
        }

        json(200, { success: true, post, message: 'Saved to Redis and file' });
        console.log(`✅ [${requestId}] Pasted 1 post into ${category}`);
      } catch (error: any) {
        console.error(`❌ [${requestId}] Error pasting post:`, error.message);
        json(500, { success: false, error: error.message });
      }
    });
    return true;
  }

  // POST /api/autobiography/autobiography - Save autobiography posts (Redis + file)
  if (pathname === '/api/autobiography/autobiography' && req.method === 'POST') {
    console.log(`📥 [${requestId}] POST /api/autobiography/autobiography`);
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { posts } = JSON.parse(body);
        if (!Array.isArray(posts)) throw new Error('Posts must be an array');
        await saveAutobiography(posts);
        if (redis) {
          // Store posts as-is in Redis (preserve rich text: HTML, <p>, spaces, paragraphs)
          const data: AutobiographyData = { version: '2.6', lastUpdated: new Date().toISOString(), posts };
          await redis.set(REDIS_KEY_AUTOBIOGRAPHY, JSON.stringify(data));
        }
        json(200, { success: true, message: `Saved ${posts.length} autobiography posts` });
        console.log(`✅ [${requestId}] Saved ${posts.length} autobiography posts`);
      } catch (error: any) {
        console.error(`❌ [${requestId}] Error saving autobiography:`, error.message);
        json(500, { success: false, error: error.message });
      }
    });
    return true;
  }

  // POST /api/autobiography/white-paper - Save white paper posts (Redis + file)
  if (pathname === '/api/autobiography/white-paper' && req.method === 'POST') {
    console.log(`📥 [${requestId}] POST /api/autobiography/white-paper`);
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { posts } = JSON.parse(body);
        if (!Array.isArray(posts)) throw new Error('Posts must be an array');
        await saveWhitePaper(posts);
        if (redis) {
          // Store posts as-is in Redis (preserve rich text: HTML, <p>, spaces, paragraphs)
          const data: AutobiographyData = { version: '2.6', lastUpdated: new Date().toISOString(), posts };
          await redis.set(REDIS_KEY_WHITE_PAPER, JSON.stringify(data));
        }
        json(200, { success: true, message: `Saved ${posts.length} white paper posts` });
        console.log(`✅ [${requestId}] Saved ${posts.length} white paper posts`);
      } catch (error: any) {
        console.error(`❌ [${requestId}] Error saving white paper:`, error.message);
        json(500, { success: false, error: error.message });
      }
    });
    return true;
  }
  
  // POST /api/autobiography/translate - Translate content
  if (pathname === '/api/autobiography/translate' && req.method === 'POST') {
    console.log(`📥 [${requestId}] POST /api/autobiography/translate`);
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { content, targetLanguage } = JSON.parse(body);
        if (!content || !targetLanguage) throw new Error('Content and targetLanguage are required');
        if (targetLanguage !== 'chinese' && targetLanguage !== 'english') throw new Error('targetLanguage must be "chinese" or "english"');
        const translated = await translateContent(content, targetLanguage);
        json(200, { success: true, translated, targetLanguage });
        console.log(`✅ [${requestId}] Translated content to ${targetLanguage}`);
      } catch (error: any) {
        console.error(`❌ [${requestId}] Error translating:`, error.message);
        json(500, { success: false, error: error.message });
      }
    });
    return true;
  }

  return false;
}

