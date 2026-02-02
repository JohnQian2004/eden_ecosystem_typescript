/**
 * Simple RSS Parser for Eden News
 * Parses RSS/Atom feeds and extracts news items with multimedia support
 */

import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

export interface RSSFeed {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface RSSItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
  category?: string[];
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video' | 'none';
  feedName: string;
  feedId: string;
}

/**
 * Parse XML content to extract RSS items
 */
function parseRSSXML(xmlContent: string, feedName: string, feedId: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  // Extract items using regex (simple but effective for RSS)
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(xmlContent)) !== null) {
    const itemContent = match[1];
    
    // Extract title
    const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? cleanXMLText(titleMatch[1]) : '';
    
    // Extract description
    const descMatch = itemContent.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const description = descMatch ? cleanXMLText(descMatch[1]) : '';
    
    // Extract link
    const linkMatch = itemContent.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || 
                     itemContent.match(/<link[^>]*href=["']([^"']+)["']/i);
    const link = linkMatch ? (linkMatch[2] || linkMatch[1]) : '';
    
    // Extract pubDate
    const pubDateMatch = itemContent.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
                        itemContent.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
    const pubDate = pubDateMatch ? cleanXMLText(pubDateMatch[1]) : new Date().toISOString();
    
    // Extract author
    const authorMatch = itemContent.match(/<author[^>]*>([\s\S]*?)<\/author>/i) ||
                       itemContent.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
    const author = authorMatch ? cleanXMLText(authorMatch[1]) : undefined;
    
    // Extract categories
    const categoryMatches = itemContent.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) ||
                           itemContent.match(/<dc:subject[^>]*>([\s\S]*?)<\/dc:subject>/gi);
    const categories: string[] = [];
    if (categoryMatches) {
      categoryMatches.forEach(catMatch => {
        const catContent = catMatch.match(/>([\s\S]*?)</);
        if (catContent) {
          categories.push(cleanXMLText(catContent[1]));
        }
      });
    }
    
    // Extract media (images and videos)
    let imageUrl: string | undefined;
    let videoUrl: string | undefined;
    let mediaType: 'image' | 'video' | 'none' = 'none';
    
    // Check for media:content (RSS Media extension)
    const mediaContentMatch = itemContent.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*type=["']([^"']+)["']/i);
    if (mediaContentMatch) {
      const mediaUrl = mediaContentMatch[1];
      const mediaTypeStr = mediaContentMatch[2].toLowerCase();
      if (mediaTypeStr.startsWith('image/')) {
        imageUrl = mediaUrl;
        mediaType = 'image';
      } else if (mediaTypeStr.startsWith('video/')) {
        videoUrl = mediaUrl;
        mediaType = 'video';
      }
    }
    
    // Check for enclosure (RSS standard)
    const enclosureMatch = itemContent.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']([^"']+)["']/i);
    if (enclosureMatch && !imageUrl && !videoUrl) {
      const encUrl = enclosureMatch[1];
      const encType = enclosureMatch[2].toLowerCase();
      if (encType.startsWith('image/')) {
        imageUrl = encUrl;
        mediaType = 'image';
      } else if (encType.startsWith('video/')) {
        videoUrl = encUrl;
        mediaType = 'video';
      }
    }
    
    // Check for og:image or meta tags in description
    if (!imageUrl) {
      const ogImageMatch = description.match(/<img[^>]*src=["']([^"']+)["']/i) ||
                          description.match(/og:image["'\s]*content=["']([^"']+)["']/i);
      if (ogImageMatch) {
        imageUrl = ogImageMatch[1];
        mediaType = 'image';
      }
    }
    
    // Extract image from description HTML
    if (!imageUrl) {
      const imgMatch = description.match(/<img[^>]*src=["']([^"']+)["']/i);
      if (imgMatch) {
        imageUrl = imgMatch[1];
        mediaType = 'image';
      }
    }
    
    if (title && link) {
      items.push({
        id: `${feedId}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        title,
        description: stripHTML(description).substring(0, 500), // Limit description length
        link,
        pubDate,
        author,
        category: categories.length > 0 ? categories : undefined,
        imageUrl,
        videoUrl,
        mediaType,
        feedName,
        feedId
      });
    }
  }
  
  return items;
}

/**
 * Clean XML text (remove CDATA, decode entities)
 */
function cleanXMLText(text: string): string {
  if (!text) return '';
  
  // Remove CDATA
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  
  // Decode HTML entities
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  return text.trim();
}

/**
 * Strip HTML tags from text
 */
function stripHTML(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Fetch RSS feed from URL
 */
export async function fetchRSSFeed(feedUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(feedUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'User-Agent': 'Eden-News-Bot/1.0'
      }
    };
    
    const req = client.request(options, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }
      
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

/**
 * Parse RSS feed and return items
 */
export async function parseRSSFeed(feedUrl: string, feedName: string, feedId: string): Promise<RSSItem[]> {
  try {
    console.log(`📰 [RSS Parser] Fetching feed: ${feedName} (${feedUrl})`);
    const xmlContent = await fetchRSSFeed(feedUrl);
    const items = parseRSSXML(xmlContent, feedName, feedId);
    console.log(`📰 [RSS Parser] Parsed ${items.length} items from ${feedName}`);
    return items;
  } catch (error: any) {
    console.error(`❌ [RSS Parser] Error parsing feed ${feedName}:`, error.message);
    return [];
  }
}

/**
 * Get default RSS feeds
 */
export function getDefaultFeeds(): RSSFeed[] {
  return [
    {
      id: 'bbc-news',
      name: 'BBC News',
      url: 'http://feeds.bbci.co.uk/news/rss.xml',
      enabled: true
    },
    {
      id: 'reuters-top',
      name: 'Reuters Top News',
      url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
      enabled: true
    },
    {
      id: 'techcrunch',
      name: 'TechCrunch',
      url: 'https://techcrunch.com/feed/',
      enabled: true
    },
    {
      id: 'the-verge',
      name: 'The Verge',
      url: 'https://www.theverge.com/rss/index.xml',
      enabled: true
    },
    {
      id: 'ars-technica',
      name: 'Ars Technica',
      url: 'https://feeds.arstechnica.com/arstechnica/index',
      enabled: true
    }
  ];
}

