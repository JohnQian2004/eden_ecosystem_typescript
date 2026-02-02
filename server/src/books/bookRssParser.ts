/**
 * Book RSS Parser
 * Fetches and parses RSS feeds for free books
 */

import * as https from 'https';
import * as http from 'http';
import * as url from 'url';

interface BookFeed {
  id: string;
  title: string;
  author?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  category?: string;
  type: 'bible' | 'book';
}

interface RSSBook {
  id: string;
  title: string;
  author?: string;
  description?: string;
  chapters: number;
  type: 'bible' | 'book';
  source: 'rss';
  feedUrl?: string;
  downloadUrl?: string;
}

/**
 * Free book RSS feed sources
 */
const FREE_BOOK_RSS_FEEDS = [
  {
    name: 'Project Gutenberg - New Releases',
    url: 'https://www.gutenberg.org/feeds/today.rss',
    type: 'book' as const
  },
  {
    name: 'ManyBooks - Free Books',
    url: 'https://manybooks.net/rss',
    type: 'book' as const
  },
  {
    name: 'Feedbooks - Public Domain',
    url: 'https://www.feedbooks.com/publicdomain/catalog.atom',
    type: 'book' as const
  },
  {
    name: 'Open Library - Recent',
    url: 'https://openlibrary.org/feeds/recently-added.xml',
    type: 'book' as const
  }
];

/**
 * Fetch RSS feed content (with redirect support)
 */
function fetchRSSFeed(feedUrl: string, maxRedirects: number = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const parsedUrl = url.parse(feedUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'User-Agent': 'Eden-Books-Bot/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      followRedirect: false // Handle redirects manually
    };
    
    const req = client.request(options, (res) => {
      // Handle redirects (301, 302, 307, 308)
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const location = res.headers.location;
        if (location) {
          // Handle relative redirects
          const redirectUrl = location.startsWith('http') ? location : url.resolve(feedUrl, location);
          console.log(`   ↪️ [BookRSS] Following redirect to: ${redirectUrl}`);
          return fetchRSSFeed(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        }
        reject(new Error(`Redirect without location header: ${res.statusCode}`));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch RSS feed: ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('RSS feed fetch timeout'));
    });

    req.end();
  });
}

/**
 * Clean XML text (remove CDATA, HTML tags, etc.)
 */
function cleanXMLText(text: string): string {
  if (!text) return '';
  // Remove CDATA wrapper
  text = text.replace(/<!\[CDATA\[(.*?)\]\]>/gi, '$1');
  // Remove HTML tags completely
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&hellip;/g, '...');
  // Decode numeric entities
  text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // Clean whitespace (multiple spaces to single, trim)
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Parse RSS/XML feed
 */
function parseRSSFeed(xmlContent: string, feedType: 'bible' | 'book'): RSSBook[] {
  const books: RSSBook[] = [];
  
  try {
    // Use regex to extract items (similar to rssParser.ts)
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    let index = 0;
    
    while ((match = itemRegex.exec(xmlContent)) !== null) {
      const itemContent = match[1];
      
      // Extract title
      const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? cleanXMLText(titleMatch[1]) : `Book ${index + 1}`;
      
      // Extract link
      const linkMatch = itemContent.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || 
                       itemContent.match(/<link[^>]*href=["']([^"']+)["']/i);
      const link = linkMatch ? cleanXMLText(linkMatch[2] || linkMatch[1]) : '';
      
      // Extract description
      const descMatch = itemContent.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
      const description = descMatch ? cleanXMLText(descMatch[1]) : '';
      
      // Extract author
      const authorMatch = itemContent.match(/<author[^>]*>([\s\S]*?)<\/author>/i) ||
                         itemContent.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
      let author = authorMatch ? cleanXMLText(authorMatch[1]) : undefined;
      
      // If no author in XML, try to extract from title or description
      if (!author) {
        const authorFromTitle = title.match(/by\s+([^,]+)/i);
        if (authorFromTitle) {
          author = authorFromTitle[1].trim();
        } else if (description) {
          const authorFromDesc = description.match(/by\s+([^<,]+)/i);
          if (authorFromDesc) {
            author = authorFromDesc[1].trim();
          }
        }
      }
      
      // Generate ID from title
      const id = `rss-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}-${index}`;
      
      books.push({
        id,
        title,
        author,
        description: description?.substring(0, 300), // Limit description length
        chapters: 0, // Will be determined when book is loaded
        type: feedType,
        source: 'rss',
        feedUrl: link,
        downloadUrl: link
      });
      
      index++;
    }
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
  }
  
  return books;
}

/**
 * Fetch books from all RSS feeds
 */
export async function fetchBooksFromRSS(): Promise<RSSBook[]> {
  const allBooks: RSSBook[] = [];
  
  for (const feed of FREE_BOOK_RSS_FEEDS) {
    try {
      console.log(`📚 [BookRSS] Fetching from ${feed.name}...`);
      const xmlContent = await fetchRSSFeed(feed.url);
      const books = parseRSSFeed(xmlContent, feed.type);
      allBooks.push(...books);
      console.log(`✅ [BookRSS] Fetched ${books.length} books from ${feed.name}`);
    } catch (error: any) {
      console.error(`❌ [BookRSS] Failed to fetch from ${feed.name}:`, error.message);
    }
  }
  
  return allBooks;
}

/**
 * Get books from a specific RSS feed
 */
export async function fetchBooksFromFeed(feedUrl: string, type: 'bible' | 'book' = 'book'): Promise<RSSBook[]> {
  try {
    const xmlContent = await fetchRSSFeed(feedUrl);
    return parseRSSFeed(xmlContent, type);
  } catch (error: any) {
    console.error(`❌ [BookRSS] Failed to fetch from ${feedUrl}:`, error.message);
    return [];
  }
}

