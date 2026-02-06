/**
 * Reddit Service
 * Fetches posts from r/GardenOfEdenBillDrape and creates new posts.
 * Uses OAuth2 client_credentials when REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set
 * (create app at https://www.reddit.com/prefs/apps, type "script").
 * On 403 (blocked), returns [] so the rest of the app keeps working.
 */

import * as https from 'https';
import * as url from 'url';

const REDDIT_SUBREDDIT = 'GardenOfEdenBillDrape';
const REDDIT_OAUTH_HOST = 'www.reddit.com';
const REDDIT_OAUTH_API = 'oauth.reddit.com';
const REDDIT_USER_AGENT = 'nodejs:eden-autobiography:v1.0.0 (by /u/billdraper)';

// Cached OAuth token (expires in 1 hour)
let cachedToken: { access_token: string; expires_at: number } | null = null;

function getRedditClientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Get an app-only OAuth2 access token (client_credentials).
 * Requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in env.
 */
function getRedditAccessToken(): Promise<string | null> {
  const creds = getRedditClientCredentials();
  if (!creds) return Promise.resolve(null);

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires_at > now + 60) {
    return Promise.resolve(cachedToken.access_token);
  }

  return new Promise((resolve) => {
    const postData = 'grant_type=client_credentials';
    const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

    const options = {
      hostname: REDDIT_OAUTH_HOST,
      port: 443,
      path: '/api/v1/access_token',
      method: 'POST',
      headers: {
        'User-Agent': REDDIT_USER_AGENT,
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            console.warn(`⚠️ [RedditService] OAuth token request failed: ${res.statusCode}`, data.substring(0, 200));
            resolve(null);
            return;
          }
          const json = JSON.parse(data);
          const access_token = json.access_token;
          const expires_in = Number(json.expires_in) || 3600;
          if (!access_token) {
            resolve(null);
            return;
          }
          cachedToken = { access_token, expires_at: now + expires_in };
          resolve(access_token);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.write(postData);
    req.end();
  });
}

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

function doFetchRedditPosts(
  host: string,
  path: string,
  bearerToken: string | null,
  limit: number
): Promise<{ posts: RedditPost[]; statusCode?: number }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': REDDIT_USER_AGENT,
      'Accept': 'application/json'
    };
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;

    const options = {
      hostname: host,
      port: 443,
      path,
      method: 'GET',
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          console.log(`📡 [RedditService] Response status: ${res.statusCode} ${res.statusMessage} (${bearerToken ? 'OAuth' : 'anonymous'})`);

          if (res.statusCode === 403) {
            resolve({ posts: [], statusCode: 403 });
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Reddit API returned HTTP ${res.statusCode}: ${res.statusMessage}`));
            return;
          }

          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Reddit API error: ${json.error}`));
            return;
          }
          if (!json.data) {
            reject(new Error('Reddit API returned no data. Subreddit may not exist or be private.'));
            return;
          }
          if (!json.data.children || json.data.children.length === 0) {
            resolve({ posts: [] });
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
          resolve({ posts });
        } catch (error: any) {
          reject(new Error(`Failed to parse Reddit response: ${error.message}`));
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Reddit API request timeout')); });
    req.end();
  });
}

/**
 * Fetch posts from Reddit subreddit.
 * Uses OAuth2 when REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are set.
 * On 403 (blocked), returns [] and logs a warning so the app keeps running.
 */
export async function fetchRedditPosts(limit: number = 100): Promise<RedditPost[]> {
  const path = `/r/${REDDIT_SUBREDDIT}/new.json?limit=${limit}`;

  // Prefer OAuth2 so we hit oauth.reddit.com (not blocked like www/old)
  const token = await getRedditAccessToken();
  if (token) {
    try {
      const { posts, statusCode } = await doFetchRedditPosts(REDDIT_OAUTH_API, path, token, limit);
      if (posts.length > 0) console.log(`✅ [RedditService] Fetched ${posts.length} posts from r/${REDDIT_SUBREDDIT} (OAuth)`);
      return posts;
    } catch (e) {
      console.warn(`⚠️ [RedditService] OAuth fetch failed, falling back to anonymous:`, (e as Error).message);
    }
  } else if (!getRedditClientCredentials()) {
    console.warn(`⚠️ [RedditService] No REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET; anonymous requests often get 403. Add env vars and create app at https://www.reddit.com/prefs/apps`);
  }

  // Anonymous: try old.reddit.com (often still 403 from server IPs)
  try {
    const { posts, statusCode } = await doFetchRedditPosts('old.reddit.com', path, null, limit);
    if (statusCode === 403) {
      console.warn(`⚠️ [RedditService] Reddit returned 403 (blocked). Returning 0 posts. To fix: set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET and create a script app at https://www.reddit.com/prefs/apps`);
      return [];
    }
    if (posts.length > 0) console.log(`✅ [RedditService] Fetched ${posts.length} posts from r/${REDDIT_SUBREDDIT}`);
    return posts;
  } catch (e) {
    console.warn(`⚠️ [RedditService] Fetch failed:`, (e as Error).message, '- returning 0 posts');
    return [];
  }
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

