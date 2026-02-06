/**
 * Reddit Service
 * Fetches posts from r/GardenOfEdenBillDrape and creates new posts
 */

import * as https from 'https';
import * as http from 'http';
import * as url from 'url';

const REDDIT_BASE_URL = 'https://www.reddit.com';
const REDDIT_SUBREDDIT = 'GardenOfEdenBillDrape';
const REDDIT_USERNAME = 'bill.draper.auto@gmail.com';
const REDDIT_PASSWORD = 'Qweasdzxc1!';

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  created_utc: number;
  score: number;
  num_comments: number;
  permalink: string;
  url: string;
  subreddit: string;
  category?: 'autobiography' | 'white_paper' | 'unsorted';
  order?: number; // For custom ordering
}

/**
 * Fetch posts from Reddit subreddit
 */
export async function fetchRedditPosts(limit: number = 100): Promise<RedditPost[]> {
  return new Promise((resolve, reject) => {
    const subredditUrl = `${REDDIT_BASE_URL}/r/${REDDIT_SUBREDDIT}/new.json?limit=${limit}`;
    const parsedUrl = url.parse(subredditUrl);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'User-Agent': 'Eden-Autobiography-Generator/1.0 (by /u/billdraper)',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          // Log response status
          console.log(`📡 [RedditService] Response status: ${res.statusCode} ${res.statusMessage}`);
          
          // Check for HTTP errors
          if (res.statusCode && res.statusCode >= 400) {
            console.error(`❌ [RedditService] HTTP error ${res.statusCode}: ${data.substring(0, 200)}`);
            reject(new Error(`Reddit API returned HTTP ${res.statusCode}: ${res.statusMessage}`));
            return;
          }
          
          const json = JSON.parse(data);
          
          // Check for Reddit API errors
          if (json.error) {
            console.error(`❌ [RedditService] Reddit API error:`, json.error);
            reject(new Error(`Reddit API error: ${json.error}`));
            return;
          }
          
          // Check if subreddit exists or is accessible
          if (!json.data) {
            console.error(`❌ [RedditService] No data in response:`, json);
            reject(new Error('Reddit API returned no data. Subreddit may not exist or be private.'));
            return;
          }
          
          // Handle empty subreddit
          if (!json.data.children || json.data.children.length === 0) {
            console.log(`⚠️ [RedditService] Subreddit r/${REDDIT_SUBREDDIT} exists but has no posts`);
            resolve([]); // Return empty array instead of error
            return;
          }
          
          const posts: RedditPost[] = (json.data.children || []).map((child: any) => {
            const post = child.data;
            return {
              id: post.id,
              title: post.title,
              selftext: post.selftext || '',
              author: post.author,
              created_utc: post.created_utc,
              score: post.score || 0,
              num_comments: post.num_comments || 0,
              permalink: `https://www.reddit.com${post.permalink}`,
              url: post.url,
              subreddit: post.subreddit,
              category: 'unsorted' as const,
              order: 0
            };
          });
          
          console.log(`✅ [RedditService] Fetched ${posts.length} posts from r/${REDDIT_SUBREDDIT}`);
          resolve(posts);
        } catch (error: any) {
          console.error(`❌ [RedditService] Parse error:`, error.message);
          console.error(`❌ [RedditService] Response data (first 500 chars):`, data.substring(0, 500));
          reject(new Error(`Failed to parse Reddit response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Reddit API request failed: ${error.message}`));
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Reddit API request timeout'));
    });
    
    req.end();
  });
}

/**
 * Create a new post on Reddit
 * Note: This requires OAuth2 authentication which is more complex
 * For now, we'll return a placeholder that can be implemented later
 */
export async function createRedditPost(
  title: string,
  content: string,
  subreddit: string = REDDIT_SUBREDDIT
): Promise<{ success: boolean; postId?: string; error?: string }> {
  // TODO: Implement Reddit OAuth2 authentication and post creation
  // This requires:
  // 1. OAuth2 token acquisition
  // 2. API call to /api/submit endpoint
  // 3. Proper error handling
  
  console.log(`📝 [RedditService] Would create post: "${title}" in r/${subreddit}`);
  console.log(`📝 [RedditService] Content length: ${content.length} characters`);
  
  return {
    success: false,
    error: 'Reddit post creation requires OAuth2 authentication. Implementation pending.'
  };
}

