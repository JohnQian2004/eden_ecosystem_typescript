/**
 * TED Talks Parser for Eden TED Module
 * Parses TED RSS feed and extracts talk information with video URLs
 */

import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

export interface TEDTalk {
  id: string;
  title: string;
  description: string;
  speaker: string;
  duration: string;
  videoUrl: string;
  thumbnailUrl: string;
  publishedDate: string;
  views?: number;
  tags?: string[];
}

/**
 * Parse XML content to extract TED talks
 */
function parseTEDXML(xmlContent: string): TEDTalk[] {
  const talks: TEDTalk[] = [];
  
  // Extract items using regex
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
    
    // Extract link (TED talk page URL)
    const linkMatch = itemContent.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || 
                     itemContent.match(/<link[^>]*href=["']([^"']+)["']/i);
    const link = linkMatch ? (linkMatch[2] || linkMatch[1]) : '';
    
    // Extract pubDate
    const pubDateMatch = itemContent.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
                        itemContent.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
    const pubDate = pubDateMatch ? cleanXMLText(pubDateMatch[1]) : new Date().toISOString();
    
    // Extract speaker from title (format: "Title | Speaker Name")
    let speaker = '';
    const speakerMatch = title.match(/\s*\|\s*(.+)$/);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
    } else {
      // Try to extract from description
      const descSpeakerMatch = description.match(/(?:Speaker|By|Presented by)[:\s]+([^<\n]+)/i);
      if (descSpeakerMatch) {
        speaker = descSpeakerMatch[1].trim();
      }
    }
    
    // Clean title (remove speaker part)
    const cleanTitle = title.replace(/\s*\|\s*.+$/, '').trim();
    
    // Extract video URL from description or media:content
    let videoUrl = '';
    const mediaContentMatch = itemContent.match(/<media:content[^>]*url=["']([^"']+)["']/i);
    if (mediaContentMatch) {
      videoUrl = mediaContentMatch[1];
    } else {
      // Try to extract from description (TED embeds)
      const embedMatch = description.match(/https?:\/\/[^"'\s<>]+\.mp4/i) ||
                        description.match(/https?:\/\/[^"'\s<>]+video\.ted\.com[^"'\s<>]+/i);
      if (embedMatch) {
        videoUrl = embedMatch[0];
      }
    }
    
    // Extract thumbnail
    let thumbnailUrl = '';
    const thumbnailMatch = itemContent.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i) ||
                          itemContent.match(/<image[^>]*>[\s\S]*?<url[^>]*>([\s\S]*?)<\/url>/i);
    if (thumbnailMatch) {
      thumbnailUrl = thumbnailMatch[1];
    } else {
      // Try to extract from description
      const imgMatch = description.match(/<img[^>]*src=["']([^"']+)["']/i);
      if (imgMatch) {
        thumbnailUrl = imgMatch[1];
      }
    }
    
    // Extract duration
    let duration = '';
    const durationMatch = itemContent.match(/<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/i);
    if (durationMatch) {
      duration = cleanXMLText(durationMatch[1]);
    }
    
    // Extract tags/categories
    const categoryMatches = itemContent.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) ||
                           itemContent.match(/<dc:subject[^>]*>([\s\S]*?)<\/dc:subject>/gi);
    const tags: string[] = [];
    if (categoryMatches) {
      categoryMatches.forEach(catMatch => {
        const catContent = catMatch.match(/>([\s\S]*?)</);
        if (catContent) {
          tags.push(cleanXMLText(catContent[1]));
        }
      });
    }
    
    // If no video URL found, try to construct from TED talk page URL
    if (!videoUrl && link) {
      // TED talk URLs are like: https://www.ted.com/talks/...
      // Video URLs are typically: https://download.ted.com/talks/... or embedded
      // For now, we'll use the link as a fallback
      videoUrl = link;
    }
    
    if (cleanTitle && link) {
      talks.push({
        id: `ted-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        title: cleanTitle,
        description: stripHTML(description).substring(0, 500),
        speaker: speaker,
        duration: duration,
        videoUrl: videoUrl || link,
        thumbnailUrl: thumbnailUrl,
        publishedDate: pubDate,
        tags: tags.length > 0 ? tags : undefined
      });
    }
  }
  
  return talks;
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
 * Fetch RSS feed from URL (with redirect support)
 */
async function fetchRSSFeed(feedUrl: string, maxRedirects: number = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }
    
    const parsedUrl = url.parse(feedUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'User-Agent': 'Eden-TED-Bot/1.0'
      }
    };
    
    const req = client.request(options, (res) => {
      // Handle redirects (301, 302, 307, 308)
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const location = res.headers.location;
        if (!location) {
          reject(new Error(`HTTP ${res.statusCode}: No location header for redirect`));
          return;
        }
        
        // Resolve relative URLs
        const redirectUrl = location.startsWith('http') ? location : url.resolve(feedUrl, location);
        console.log(`🎤 [TED Parser] Following redirect ${res.statusCode} to: ${redirectUrl}`);
        
        // Recursively follow redirect
        fetchRSSFeed(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }
      
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
 * Parse TED RSS feed and return talks
 */
export async function parseTEDFeed(): Promise<TEDTalk[]> {
  try {
    // TED RSS feed URL (will redirect to CDN)
    const feedUrl = 'https://www.ted.com/feeds/talks.rss';
    console.log(`🎤 [TED Parser] Fetching feed: ${feedUrl}`);
    const xmlContent = await fetchRSSFeed(feedUrl);
    const talks = parseTEDXML(xmlContent);
    console.log(`🎤 [TED Parser] Parsed ${talks.length} talks`);
    return talks;
  } catch (error: any) {
    console.error(`❌ [TED Parser] Error parsing feed:`, error.message);
    // Try alternative URL if main feed fails
    try {
      console.log(`🎤 [TED Parser] Trying alternative feed URL...`);
      const altFeedUrl = 'https://feeds.feedburner.com/tedtalks_video';
      const xmlContent = await fetchRSSFeed(altFeedUrl);
      const talks = parseTEDXML(xmlContent);
      console.log(`🎤 [TED Parser] Parsed ${talks.length} talks from alternative feed`);
      return talks;
    } catch (altError: any) {
      console.error(`❌ [TED Parser] Alternative feed also failed:`, altError.message);
      return [];
    }
  }
}

