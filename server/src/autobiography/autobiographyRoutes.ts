/**
 * Autobiography Routes
 * Backend API routes for autobiography generator
 */

import * as http from 'http';
import { fetchRedditPosts, createRedditPost, RedditPost } from './redditService';
import {
  loadAutobiography,
  loadWhitePaper,
  saveAutobiography,
  saveWhitePaper,
  translateContent,
  AutobiographyPost
} from './autobiographyService';

export async function handleAutobiographyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<boolean> {
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // GET /api/autobiography/reddit/posts - Fetch posts from Reddit
  if (pathname === '/api/autobiography/reddit/posts' && req.method === 'GET') {
    console.log(`📥 [${requestId}] GET /api/autobiography/reddit/posts`);
    
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      
      const posts = await fetchRedditPosts(limit);
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: true,
        posts,
        count: posts.length
      }));
      
      console.log(`✅ [${requestId}] Returned ${posts.length} Reddit posts`);
      return true;
    } catch (error: any) {
      console.error(`❌ [${requestId}] Error fetching Reddit posts:`, error.message);
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
      return true;
    }
  }
  
  // GET /api/autobiography/autobiography - Load autobiography posts
  if (pathname === '/api/autobiography/autobiography' && req.method === 'GET') {
    console.log(`📥 [${requestId}] GET /api/autobiography/autobiography`);
    
    try {
      const data = loadAutobiography();
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: true,
        data
      }));
      
      console.log(`✅ [${requestId}] Returned ${data.posts.length} autobiography posts`);
      return true;
    } catch (error: any) {
      console.error(`❌ [${requestId}] Error loading autobiography:`, error.message);
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
      return true;
    }
  }
  
  // GET /api/autobiography/white-paper - Load white paper posts
  if (pathname === '/api/autobiography/white-paper' && req.method === 'GET') {
    console.log(`📥 [${requestId}] GET /api/autobiography/white-paper`);
    
    try {
      const data = loadWhitePaper();
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: true,
        data
      }));
      
      console.log(`✅ [${requestId}] Returned ${data.posts.length} white paper posts`);
      return true;
    } catch (error: any) {
      console.error(`❌ [${requestId}] Error loading white paper:`, error.message);
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
      return true;
    }
  }
  
  // POST /api/autobiography/autobiography - Save autobiography posts
  if (pathname === '/api/autobiography/autobiography' && req.method === 'POST') {
    console.log(`📥 [${requestId}] POST /api/autobiography/autobiography`);
    
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { posts } = JSON.parse(body);
        
        if (!Array.isArray(posts)) {
          throw new Error('Posts must be an array');
        }
        
        await saveAutobiography(posts);
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          message: `Saved ${posts.length} autobiography posts`
        }));
        
        console.log(`✅ [${requestId}] Saved ${posts.length} autobiography posts`);
      } catch (error: any) {
        console.error(`❌ [${requestId}] Error saving autobiography:`, error.message);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    
    return true;
  }
  
  // POST /api/autobiography/white-paper - Save white paper posts
  if (pathname === '/api/autobiography/white-paper' && req.method === 'POST') {
    console.log(`📥 [${requestId}] POST /api/autobiography/white-paper`);
    
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { posts } = JSON.parse(body);
        
        if (!Array.isArray(posts)) {
          throw new Error('Posts must be an array');
        }
        
        await saveWhitePaper(posts);
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          message: `Saved ${posts.length} white paper posts`
        }));
        
        console.log(`✅ [${requestId}] Saved ${posts.length} white paper posts`);
      } catch (error: any) {
        console.error(`❌ [${requestId}] Error saving white paper:`, error.message);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    
    return true;
  }
  
  // POST /api/autobiography/translate - Translate content
  if (pathname === '/api/autobiography/translate' && req.method === 'POST') {
    console.log(`📥 [${requestId}] POST /api/autobiography/translate`);
    
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { content, targetLanguage } = JSON.parse(body);
        
        if (!content || !targetLanguage) {
          throw new Error('Content and targetLanguage are required');
        }
        
        if (targetLanguage !== 'chinese' && targetLanguage !== 'english') {
          throw new Error('targetLanguage must be "chinese" or "english"');
        }
        
        const translated = await translateContent(content, targetLanguage);
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: true,
          translated,
          targetLanguage
        }));
        
        console.log(`✅ [${requestId}] Translated content to ${targetLanguage}`);
      } catch (error: any) {
        console.error(`❌ [${requestId}] Error translating:`, error.message);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    
    return true;
  }
  
  // POST /api/autobiography/reddit/create - Create new Reddit post
  if (pathname === '/api/autobiography/reddit/create' && req.method === 'POST') {
    console.log(`📥 [${requestId}] POST /api/autobiography/reddit/create`);
    
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { title, content, subreddit } = JSON.parse(body);
        
        if (!title || !content) {
          throw new Error('Title and content are required');
        }
        
        const result = await createRedditPost(title, content, subreddit);
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(result));
        
        console.log(`✅ [${requestId}] Reddit post creation result:`, result);
      } catch (error: any) {
        console.error(`❌ [${requestId}] Error creating Reddit post:`, error.message);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    
    return true;
  }
  
  return false;
}

