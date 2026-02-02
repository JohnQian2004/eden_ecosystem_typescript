/**
 * Books API Routes
 * Handles book listing, chapter retrieval, and text-to-speech
 */

import { IncomingMessage, ServerResponse } from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { parsePDF } from './pdfParser';
import { fetchBooksFromRSS, fetchBooksFromFeed } from './bookRssParser';

const BOOKS_API_PREFIX = '/api/books';
const BOOKS_DIR = path.resolve(__dirname, '../../../data/books');

// Ensure books directory exists
if (!fs.existsSync(BOOKS_DIR)) {
  fs.mkdirSync(BOOKS_DIR, { recursive: true });
}

interface Book {
  id: string;
  title: string;
  author?: string;
  description?: string;
  chapters: number;
  type: 'bible' | 'book';
  filePath?: string;
}

interface Chapter {
  id: string;
  bookId: string;
  number: number;
  title: string;
  content: string;
  verses?: Array<{ number: number; text: string }>;
}

// Cache for parsed books
const bookCache: Map<string, any> = new Map();
// Cache for RSS books (refresh every hour)
let rssBooksCache: Book[] = [];
let rssBooksCacheTime: number = 0;
const RSS_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Bible chapters cache file
const BIBLE_CACHE_DIR = path.join(BOOKS_DIR, 'bible-cache');
if (!fs.existsSync(BIBLE_CACHE_DIR)) {
  fs.mkdirSync(BIBLE_CACHE_DIR, { recursive: true });
}
const BIBLE_CHAPTERS_CACHE_FILE = path.join(BIBLE_CACHE_DIR, 'chapters.json');
const BIBLE_CHAPTER_CONTENT_CACHE_DIR = path.join(BIBLE_CACHE_DIR, 'chapters');
if (!fs.existsSync(BIBLE_CHAPTER_CONTENT_CACHE_DIR)) {
  fs.mkdirSync(BIBLE_CHAPTER_CONTENT_CACHE_DIR, { recursive: true });
}

/**
 * Load books metadata (from local files and RSS feeds)
 */
async function loadBooks(): Promise<Book[]> {
  const books: Book[] = [];
  
  // Load local books from books.json (Bible MUST be first)
  const metadataPath = path.join(BOOKS_DIR, 'books.json');
  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      const localBooks = metadata.books || [];
      console.log(`📚 [BooksAPI] Loaded ${localBooks.length} book(s) from books.json`);
      console.log(`📚 [BooksAPI] Book IDs from JSON: ${localBooks.map((b: Book) => b.id).join(', ')}`);
      
      // Sort: Bible books first, then others
      const bibleBooks = localBooks.filter((b: Book) => b.type === 'bible' || b.title.toLowerCase().includes('bible'));
      const otherBooks = localBooks.filter((b: Book) => !b.type || (b.type !== 'bible' && !b.title.toLowerCase().includes('bible')));
      // ALWAYS put Bible books first
      books.push(...bibleBooks, ...otherBooks);
      console.log(`📚 [BooksAPI] Loaded ${bibleBooks.length} Bible book(s) and ${otherBooks.length} other book(s) from JSON`);
    } catch (error) {
      console.error('Failed to load books metadata:', error);
    }
  } else {
    console.warn(`⚠️ [BooksAPI] books.json not found at ${metadataPath}`);
  }

  // Scan for PDF files (Bible PDFs should be added to Bible section)
  if (fs.existsSync(BOOKS_DIR)) {
    const files = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.pdf'));
    const pdfBibleBooks: Book[] = [];
    const pdfOtherBooks: Book[] = [];
    
    files.forEach((file, index) => {
      const bookId = `book-${index + 1}`;
      const title = path.basename(file, '.pdf').replace(/_/g, ' ');
      const isBible = title.toLowerCase().includes('bible');
      const book: Book = {
        id: bookId,
        title: title,
        chapters: 0, // Will be determined when parsing
        type: isBible ? 'bible' : 'book',
        filePath: path.join(BOOKS_DIR, file)
      };
      
      if (isBible) {
        pdfBibleBooks.push(book);
      } else {
        pdfOtherBooks.push(book);
      }
    });
    
    // Add Bible PDFs first, then other PDFs
    books.push(...pdfBibleBooks, ...pdfOtherBooks);
  }

  // Load RSS books (with caching) - add after Bible
  const now = Date.now();
  if (now - rssBooksCacheTime > RSS_CACHE_DURATION || rssBooksCache.length === 0) {
    try {
      console.log('📚 [BooksAPI] Fetching books from RSS feeds...');
      const rssBooks = await fetchBooksFromRSS();
      rssBooksCache = rssBooks;
      rssBooksCacheTime = now;
      console.log(`✅ [BooksAPI] Loaded ${rssBooks.length} books from RSS feeds`);
    } catch (error: any) {
      console.error('❌ [BooksAPI] Failed to fetch RSS books:', error.message);
    }
  }
  
  // Add RSS books after local books (Bible stays first)
  books.push(...rssBooksCache);

  // Final sort: Bible books ALWAYS first, with Eden Bible as the absolute first
  books.sort((a, b) => {
    const aIsBible = a.type === 'bible' || a.title.toLowerCase().includes('bible');
    const bIsBible = b.type === 'bible' || b.title.toLowerCase().includes('bible');
    
    // Check if it's specifically "Eden Bible"
    const aIsEdenBible = a.title.toLowerCase() === 'eden bible' || (a.id === 'eden-bible');
    const bIsEdenBible = b.title.toLowerCase() === 'eden bible' || (b.id === 'eden-bible');
    
    // Eden Bible is ALWAYS first
    if (aIsEdenBible && !bIsEdenBible) return -1;
    if (!aIsEdenBible && bIsEdenBible) return 1;
    
    // Bible books come after Eden Bible but before other books
    if (aIsBible && !bIsBible) return -1;
    if (!aIsBible && bIsBible) return 1;
    
    // If both are Bible (but not Eden Bible), sort by title
    if (aIsBible && bIsBible) {
      return a.title.localeCompare(b.title);
    }
    
    // If both are not Bible, sort by title
    return a.title.localeCompare(b.title);
  });

  console.log(`📚 [BooksAPI] Final book list order: ${books.map(b => b.title).join(', ')}`);
  return books;
}

/**
 * Load Bible chapters from cache file (if exists) or generate them
 */
async function loadBibleChapters(book: Book): Promise<Chapter[]> {
  const cacheKey = `bible-chapters-${book.id}`;
  
  // Check in-memory cache first
  if (bookCache.has(cacheKey)) {
    return bookCache.get(cacheKey);
  }

  // Try to load from disk cache
  if (fs.existsSync(BIBLE_CHAPTERS_CACHE_FILE)) {
    try {
      const cachedData = JSON.parse(fs.readFileSync(BIBLE_CHAPTERS_CACHE_FILE, 'utf-8'));
      if (cachedData.chapters && Array.isArray(cachedData.chapters) && cachedData.chapters.length > 0) {
        console.log(`📖 [BooksAPI] Loaded ${cachedData.chapters.length} Bible chapters from cache file`);
        bookCache.set(cacheKey, cachedData.chapters);
        return cachedData.chapters;
      }
    } catch (error) {
      console.warn(`⚠️ [BooksAPI] Failed to load Bible chapters from cache: ${error}`);
    }
  }

  // If no cache exists, generate chapters structure (without content)
  return generateBibleChaptersStructure(book);
}

/**
 * Generate Bible chapters structure (without content) - this is the chapter list
 */
async function generateBibleChaptersStructure(book: Book): Promise<Chapter[]> {
  const cacheKey = `bible-chapters-${book.id}`;
  
  try {
    console.log(`📖 [BooksAPI] Creating Bible chapters structure for ${book.title}...`);
    
    // Bible has 66 books with varying chapters
    const bibleBooks = [
      { name: 'Genesis', chapters: 50 },
      { name: 'Exodus', chapters: 40 },
      { name: 'Leviticus', chapters: 27 },
      { name: 'Numbers', chapters: 36 },
      { name: 'Deuteronomy', chapters: 34 },
      { name: 'Joshua', chapters: 24 },
      { name: 'Judges', chapters: 21 },
      { name: 'Ruth', chapters: 4 },
      { name: '1 Samuel', chapters: 31 },
      { name: '2 Samuel', chapters: 24 },
      { name: '1 Kings', chapters: 22 },
      { name: '2 Kings', chapters: 25 },
      { name: '1 Chronicles', chapters: 29 },
      { name: '2 Chronicles', chapters: 36 },
      { name: 'Ezra', chapters: 10 },
      { name: 'Nehemiah', chapters: 13 },
      { name: 'Esther', chapters: 10 },
      { name: 'Job', chapters: 42 },
      { name: 'Psalms', chapters: 150 },
      { name: 'Proverbs', chapters: 31 },
      { name: 'Ecclesiastes', chapters: 12 },
      { name: 'Song of Songs', chapters: 8 },
      { name: 'Isaiah', chapters: 66 },
      { name: 'Jeremiah', chapters: 52 },
      { name: 'Lamentations', chapters: 5 },
      { name: 'Ezekiel', chapters: 48 },
      { name: 'Daniel', chapters: 12 },
      { name: 'Hosea', chapters: 14 },
      { name: 'Joel', chapters: 3 },
      { name: 'Amos', chapters: 9 },
      { name: 'Obadiah', chapters: 1 },
      { name: 'Jonah', chapters: 4 },
      { name: 'Micah', chapters: 7 },
      { name: 'Nahum', chapters: 3 },
      { name: 'Habakkuk', chapters: 3 },
      { name: 'Zephaniah', chapters: 3 },
      { name: 'Haggai', chapters: 2 },
      { name: 'Zechariah', chapters: 14 },
      { name: 'Malachi', chapters: 4 },
      { name: 'Matthew', chapters: 28 },
      { name: 'Mark', chapters: 16 },
      { name: 'Luke', chapters: 24 },
      { name: 'John', chapters: 21 },
      { name: 'Acts', chapters: 28 },
      { name: 'Romans', chapters: 16 },
      { name: '1 Corinthians', chapters: 16 },
      { name: '2 Corinthians', chapters: 13 },
      { name: 'Galatians', chapters: 6 },
      { name: 'Ephesians', chapters: 6 },
      { name: 'Philippians', chapters: 4 },
      { name: 'Colossians', chapters: 4 },
      { name: '1 Thessalonians', chapters: 5 },
      { name: '2 Thessalonians', chapters: 3 },
      { name: '1 Timothy', chapters: 6 },
      { name: '2 Timothy', chapters: 4 },
      { name: 'Titus', chapters: 3 },
      { name: 'Philemon', chapters: 1 },
      { name: 'Hebrews', chapters: 13 },
      { name: 'James', chapters: 5 },
      { name: '1 Peter', chapters: 5 },
      { name: '2 Peter', chapters: 3 },
      { name: '1 John', chapters: 5 },
      { name: '2 John', chapters: 1 },
      { name: '3 John', chapters: 1 },
      { name: 'Jude', chapters: 1 },
      { name: 'Revelation', chapters: 22 }
    ];

    const chapters: Chapter[] = [];
    let chapterNumber = 1;

    for (const bibleBook of bibleBooks) {
      for (let i = 1; i <= bibleBook.chapters; i++) {
        chapters.push({
          id: `chapter-${chapterNumber}`,
          bookId: book.id,
          number: chapterNumber,
          title: `${bibleBook.name} Chapter ${i}`,
          content: '' // Content will be generated when chapter is selected
        });
        chapterNumber++;
      }
    }

    // Save to disk cache
    try {
      fs.writeFileSync(BIBLE_CHAPTERS_CACHE_FILE, JSON.stringify({ chapters }, null, 2), 'utf-8');
      console.log(`💾 [BooksAPI] Saved ${chapters.length} Bible chapters to cache file`);
    } catch (error) {
      console.warn(`⚠️ [BooksAPI] Failed to save Bible chapters to cache: ${error}`);
    }
    
    bookCache.set(cacheKey, chapters);
    console.log(`✅ [BooksAPI] Created ${chapters.length} Bible chapters structure`);
    return chapters;
  } catch (error: any) {
    console.error(`Failed to generate Bible chapters:`, error);
    return [];
  }
}

/**
 * Generate Bible chapter content using LLM
 */
async function generateBibleChapterContent(book: Book, chapterNumber: number): Promise<Chapter> {
  const cacheKey = `bible-chapter-${book.id}-${chapterNumber}`;
  const chapterCacheFile = path.join(BIBLE_CHAPTER_CONTENT_CACHE_DIR, `${book.id}-chapter-${chapterNumber}.json`);
  
  // Always call LLM - skip cache for now to ensure LLM is called
  console.log(`📖 [BooksAPI] Generating content for Bible chapter ${chapterNumber} using LLM (skipping cache)...`);
  
  // Get the chapter title from the chapters list (outside try block so it's accessible in catch)
  let chapterTitle = `Chapter ${chapterNumber}`;
  try {
    const chapters = await loadBibleChapters(book);
    const chapter = chapters.find(c => c.number === chapterNumber);
    chapterTitle = chapter?.title || `Chapter ${chapterNumber}`;

    // Call Ollama API to generate Bible chapter content
    const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
    const OLLAMA_PORT = process.env.OLLAMA_PORT || '11434';
    const OLLAMA_MODEL = 'deepseek-r1:latest';
    
    const prompt = `Please provide key highlights and summaries of ${chapterTitle} from the Bible. Focus on the main themes, important verses, and key messages. Do not include the entire chapter text - only provide highlights, summaries, and key takeaways. Format it clearly with bullet points or numbered highlights.`;

    // Ollama Chat API format
    const requestBody = JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: false,
      options: {
        temperature: 0.3, // Lower temperature for more accurate Bible text
        num_predict: 4000 // max_tokens equivalent
      }
    });

    // Add timeout (120 seconds - Ollama can be slower)
    const timeout = 120000;
    const fullChapter = await new Promise<Chapter>((resolve, reject) => {
      const req = http.request(
        {
          hostname: OLLAMA_HOST,
          port: parseInt(OLLAMA_PORT, 10),
          path: '/api/chat', // Ollama chat endpoint
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody)
          },
          timeout: timeout
        },
        (res) => {
          let data = '';
          
          // Check for errors
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Ollama API error: ${res.statusCode} ${res.statusMessage}`));
            return;
          }
          
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              
              // Ollama Chat API returns text in message.content field
              let content = '';
              if (parsed.message && parsed.message.content) {
                content = parsed.message.content;
              } else if (parsed.message && typeof parsed.message === 'string') {
                content = parsed.message;
              } else if (parsed.response) {
                content = parsed.response;
              } else if (parsed.text) {
                content = parsed.text;
              } else if (parsed.content) {
                content = parsed.content;
              }
              
              if (!content || content.trim() === '') {
                reject(new Error(`No content in LLM response. Response: ${JSON.stringify(parsed).substring(0, 500)}`));
                return;
              }
              
              // Parse verses from the content (look for verse numbers)
              const verses: Array<{ number: number; text: string }> = [];
              // Try multiple verse patterns
              const versePatterns = [
                /(\d+)\s+(.+?)(?=\d+\s+|$)/g,  // "1 text 2 text"
                /\[(\d+)\]\s*(.+?)(?=\[\d+\]|$)/g,  // "[1] text [2] text"
                /^(\d+)[\.:]\s*(.+)$/gm  // "1. text" or "1: text" on new lines
              ];
              
              for (const pattern of versePatterns) {
                let verseMatch;
                pattern.lastIndex = 0; // Reset regex
                while ((verseMatch = pattern.exec(content)) !== null) {
                  const verseNum = parseInt(verseMatch[1], 10);
                  const verseText = verseMatch[2]?.trim() || '';
                  if (verseNum && verseText) {
                    // Avoid duplicates
                    if (!verses.find(v => v.number === verseNum)) {
                      verses.push({
                        number: verseNum,
                        text: verseText
                      });
                    }
                  }
                }
                if (verses.length > 0) break; // Use first pattern that finds verses
              }

              // Sort verses by number
              verses.sort((a, b) => a.number - b.number);

              const fullChapter: Chapter = {
                id: `chapter-${chapterNumber}`,
                bookId: book.id,
                number: chapterNumber,
                title: chapterTitle,
                content: content,
                verses: verses.length > 0 ? verses : undefined
              };

              // Save to disk cache
              try {
                fs.writeFileSync(chapterCacheFile, JSON.stringify(fullChapter, null, 2), 'utf-8');
                console.log(`💾 [BooksAPI] Saved Bible chapter ${chapterNumber} content to cache file`);
              } catch (error) {
                console.warn(`⚠️ [BooksAPI] Failed to save Bible chapter ${chapterNumber} to cache: ${error}`);
              }
              
              bookCache.set(cacheKey, fullChapter);
              resolve(fullChapter);
            } catch (error: any) {
              reject(new Error(`Failed to parse LLM response: ${error.message}`));
            }
          });
        }
      );

      req.on('error', (error) => {
        console.error(`❌ [BooksAPI] Ollama API request error:`, error);
        reject(error);
      });
      
      req.on('timeout', () => {
        console.error(`⏱️ [BooksAPI] Cohere API request timeout after ${timeout}ms`);
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms`));
      });

      req.setTimeout(timeout);
      req.write(requestBody);
      req.end();
    });

    return fullChapter;
  } catch (error: any) {
    console.error(`Failed to generate Bible chapter content:`, error);
    // Return placeholder if LLM fails
    return {
      id: `chapter-${chapterNumber}`,
      bookId: book.id,
      number: chapterNumber,
      title: `Chapter ${chapterNumber}`,
      content: `Content for ${chapterTitle} is being generated. Please try again in a moment.`
    };
  }
}

/**
 * Parse book chapters from PDF
 */
async function parseBookChapters(book: Book): Promise<Chapter[]> {
  const cacheKey = `chapters-${book.id}`;
  if (bookCache.has(cacheKey)) {
    return bookCache.get(cacheKey);
  }

  if (!book.filePath || !fs.existsSync(book.filePath)) {
    return [];
  }

  try {
    const chapters = await parsePDF(book.filePath, book.type);
    bookCache.set(cacheKey, chapters);
    return chapters;
  } catch (error: any) {
    console.error(`Failed to parse book ${book.id}:`, error);
    return [];
  }
}

/**
 * Handle books API requests
 */
export function handleBooksRequest(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  console.log(`📚 [BooksAPI] handleBooksRequest called with pathname: ${pathname}, method: ${req.method}`);
  
  if (!pathname.startsWith(BOOKS_API_PREFIX)) {
    console.log(`📚 [BooksAPI] Pathname doesn't start with ${BOOKS_API_PREFIX}, returning false`);
    return false;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`📚 [BooksAPI] Handling request: ${req.method} ${req.url}`);
  console.log(`📚 [BooksAPI] Pathname: ${pathname}`);

  // Helper for sending JSON responses
  const sendJsonResponse = (statusCode: number, data: any) => {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
  };

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  // GET /api/books/list
  if (pathname === `${BOOKS_API_PREFIX}/list` && req.method === 'GET') {
    loadBooks().then(books => {
      sendJsonResponse(200, { success: true, data: books });
    }).catch(error => {
      sendJsonResponse(500, { success: false, error: error.message });
    });
    return true;
  }

  // GET /api/books/search?q=...
  if (pathname.startsWith(`${BOOKS_API_PREFIX}/search`) && req.method === 'GET') {
    try {
      const parsedUrl = url.parse(req.url || '/', true);
      const query = (parsedUrl.query.q as string) || '';
      loadBooks().then(books => {
        const filtered = books.filter(book => 
          book.title.toLowerCase().includes(query.toLowerCase()) ||
          (book.author && book.author.toLowerCase().includes(query.toLowerCase()))
        );
        sendJsonResponse(200, { success: true, data: filtered });
      }).catch(error => {
        sendJsonResponse(500, { success: false, error: error.message });
      });
    } catch (error: any) {
      sendJsonResponse(500, { success: false, error: error.message });
    }
    return true;
  }

  // GET /api/books/:bookId/chapters/:chapterNumber (get specific chapter content)
  // CHECK THIS FIRST - more specific route must come before less specific
  console.log(`📖 [BooksAPI] Checking chapter content route for pathname: ${pathname}`);
  const chapterContentMatch = pathname.match(/^\/api\/books\/([^\/]+)\/chapters\/(\d+)$/);
  console.log(`📖 [BooksAPI] Regex match result: ${chapterContentMatch ? 'MATCHED' : 'NO MATCH'}, method: ${req.method}`);
  if (chapterContentMatch && req.method === 'GET') {
    const bookId = chapterContentMatch[1];
    const chapterNumber = parseInt(chapterContentMatch[2], 10);
    
    console.log(`📖 [BooksAPI] Route matched! bookId=${bookId}, chapterNumber=${chapterNumber}, pathname=${pathname}`);
    
    loadBooks().then(books => {
      let book = books.find(b => b.id === bookId);
      
      // If book not found, create default Eden Bible
      if (!book && (bookId === 'eden-bible' || bookId.toLowerCase().includes('bible'))) {
        console.log(`📖 [BooksAPI] Creating default Eden Bible book`);
        book = {
          id: 'eden-bible',
          title: 'Eden Bible',
          author: 'Various',
          description: 'The complete Bible with all 66 books and 1,189 chapters.',
          chapters: 1189,
          type: 'bible'
        };
      }
      
      if (!book) {
        console.error(`❌ [BooksAPI] Book not found: ${bookId}. Available books: ${books.map(b => b.id).join(', ')}`);
        sendJsonResponse(404, { success: false, error: `Book not found: ${bookId}` });
        return;
      }

      console.log(`✅ [BooksAPI] Found book: ${book.title} (${book.id}), type: ${book.type}. Calling LLM...`);

      // For Bible, generate chapter content using LLM
      if (book.type === 'bible' || book.title.toLowerCase().includes('bible')) {
        generateBibleChapterContent(book, chapterNumber).then(chapter => {
          console.log(`✅ [BooksAPI] LLM returned chapter content, length: ${chapter.content?.length || 0}`);
          sendJsonResponse(200, { success: true, data: chapter });
        }).catch(error => {
          console.error(`❌ [BooksAPI] LLM generation failed:`, error);
          sendJsonResponse(500, { success: false, error: error.message });
        });
        return;
      }

      sendJsonResponse(404, { success: false, error: 'Chapter not found' });
    }).catch(error => {
      console.error(`❌ [BooksAPI] loadBooks failed:`, error);
      sendJsonResponse(500, { success: false, error: error.message });
    });
    return true;
  }

  // POST /api/books/tts (text-to-speech)
  if (pathname === `${BOOKS_API_PREFIX}/tts` && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const text = data.text || '';
        
        // For now, return a placeholder audio URL
        // In production, you would generate TTS audio here
        sendJsonResponse(200, {
          success: true,
          audioUrl: `/api/books/tts/audio?text=${encodeURIComponent(text.substring(0, 100))}`
        });
      } catch (error: any) {
        sendJsonResponse(500, { success: false, error: error.message });
      }
    });
    return true;
  }

  // No route matched
  console.log(`❌ [BooksAPI] No route matched for pathname: ${pathname}, method: ${req.method}`);
  console.log(`❌ [BooksAPI] Tried to match: /api/books/:bookId/chapters/:chapterNumber`);
  sendJsonResponse(404, { success: false, error: `Route not found: ${pathname}` });
  return true; // We handled it (returned 404)
}

