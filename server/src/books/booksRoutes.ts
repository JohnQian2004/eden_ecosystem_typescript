/**
 * Books API Routes
 * Handles book listing, chapter retrieval, and text-to-speech
 */

import { IncomingMessage, ServerResponse } from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
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
      // Sort: Bible books first, then others
      const bibleBooks = localBooks.filter((b: Book) => b.type === 'bible' || b.title.toLowerCase().includes('bible'));
      const otherBooks = localBooks.filter((b: Book) => !b.type || (b.type !== 'bible' && !b.title.toLowerCase().includes('bible')));
      // ALWAYS put Bible books first
      books.push(...bibleBooks, ...otherBooks);
      console.log(`📚 [BooksAPI] Loaded ${bibleBooks.length} Bible book(s) and ${otherBooks.length} other book(s)`);
    } catch (error) {
      console.error('Failed to load books metadata:', error);
    }
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

  // Final sort: Bible books ALWAYS first, then others (by title)
  books.sort((a, b) => {
    const aIsBible = a.type === 'bible' || a.title.toLowerCase().includes('bible');
    const bIsBible = b.type === 'bible' || b.title.toLowerCase().includes('bible');
    
    // Bible books ALWAYS come first
    if (aIsBible && !bIsBible) return -1;
    if (!aIsBible && bIsBible) return 1;
    
    // If both are Bible, sort by title (Eden Bible should be first)
    if (aIsBible && bIsBible) {
      const aIsEdenBible = a.title.toLowerCase().includes('eden');
      const bIsEdenBible = b.title.toLowerCase().includes('eden');
      if (aIsEdenBible && !bIsEdenBible) return -1;
      if (!aIsEdenBible && bIsEdenBible) return 1;
      return a.title.localeCompare(b.title);
    }
    
    // If both are not Bible, sort by title
    return a.title.localeCompare(b.title);
  });

  console.log(`📚 [BooksAPI] Final book list order: ${books.map(b => b.title).join(', ')}`);
  return books;
}

/**
 * Generate Bible chapters using LLM
 */
async function generateBibleChapters(book: Book): Promise<Chapter[]> {
  const cacheKey = `bible-chapters-${book.id}`;
  if (bookCache.has(cacheKey)) {
    return bookCache.get(cacheKey);
  }

  try {
    console.log(`📖 [BooksAPI] Generating Bible chapters for ${book.title} using LLM...`);
    
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

    bookCache.set(cacheKey, chapters);
    console.log(`✅ [BooksAPI] Generated ${chapters.length} Bible chapters`);
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
  if (bookCache.has(cacheKey)) {
    return bookCache.get(cacheKey);
  }

  try {
    console.log(`📖 [BooksAPI] Generating content for Bible chapter ${chapterNumber} using LLM...`);
    
    // Get the chapter title from the chapters list
    const chapters = await generateBibleChapters(book);
    const chapter = chapters.find(c => c.number === chapterNumber);
    const chapterTitle = chapter?.title || `Chapter ${chapterNumber}`;

    // Call Cohere API to generate Bible chapter content
    const COHERE_API_KEY = "tHJAN4gUTZ4GM1IJ25FQFbKydqBp6LCVbsAxXggB";
    const COHERE_API_HOST = "api.cohere.ai";
    
    const prompt = `Please provide the complete text of ${chapterTitle} from the Bible. Include all verses with their verse numbers. Format it clearly with each verse on a new line.`;

    const requestBody = JSON.stringify({
      message: prompt,
      model: 'command-r7b-12-2024',
      temperature: 0.3, // Lower temperature for more accurate Bible text
      max_tokens: 4000
    });

    const fullChapter = await new Promise<Chapter>((resolve, reject) => {
      const req = https.request(
        {
          hostname: COHERE_API_HOST,
          port: 443,
          path: '/v1/chat',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${COHERE_API_KEY}`,
            'Content-Length': Buffer.byteLength(requestBody)
          }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.text || parsed.message || '';
              
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

              bookCache.set(cacheKey, fullChapter);
              resolve(fullChapter);
            } catch (error: any) {
              reject(new Error(`Failed to parse LLM response: ${error.message}`));
            }
          });
        }
      );

      req.on('error', (error) => {
        reject(error);
      });

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
  if (!pathname.startsWith(BOOKS_API_PREFIX)) {
    return false;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`📚 [BooksAPI] Handling request: ${req.method} ${req.url}`);

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

  // GET /api/books/:bookId/chapters
  const chaptersMatch = pathname.match(/^\/api\/books\/([^\/]+)\/chapters$/);
  if (chaptersMatch && req.method === 'GET') {
    const bookId = chaptersMatch[1];
    loadBooks().then(books => {
      const book = books.find(b => b.id === bookId);
      
      if (!book) {
        sendJsonResponse(404, { success: false, error: 'Book not found' });
        return;
      }

      // For Bible books, generate chapters using LLM
      if (book.type === 'bible' || book.title.toLowerCase().includes('bible')) {
        generateBibleChapters(book).then(chapters => {
          sendJsonResponse(200, { success: true, data: chapters });
        }).catch(error => {
          sendJsonResponse(500, { success: false, error: error.message });
        });
        return;
      }

      // For RSS books, return placeholder chapters
      if ((book as any).source === 'rss') {
        const chapters: Chapter[] = [];
        for (let i = 1; i <= 20; i++) {
          chapters.push({
            id: `chapter-${i}`,
            bookId: book.id,
            number: i,
            title: `Chapter ${i}`,
            content: `This is Chapter ${i} of ${book.title}. This book is available from a free RSS feed. To read the full content, please visit: ${(book as any).downloadUrl || (book as any).feedUrl || 'N/A'}`
          });
        }
        sendJsonResponse(200, { success: true, data: chapters });
        return;
      }

      parseBookChapters(book).then(chapters => {
        sendJsonResponse(200, { success: true, data: chapters });
      }).catch(error => {
        sendJsonResponse(500, { success: false, error: error.message });
      });
    }).catch(error => {
      sendJsonResponse(500, { success: false, error: error.message });
    });
    return true;
  }

  // GET /api/books/:bookId/chapters/:chapterNumber (get specific chapter content)
  const chapterContentMatch = pathname.match(/^\/api\/books\/([^\/]+)\/chapters\/(\d+)$/);
  if (chapterContentMatch && req.method === 'GET') {
    const bookId = chapterContentMatch[1];
    const chapterNumber = parseInt(chapterContentMatch[2], 10);
    
    loadBooks().then(books => {
      const book = books.find(b => b.id === bookId);
      
      if (!book) {
        sendJsonResponse(404, { success: false, error: 'Book not found' });
        return;
      }

      // For Bible, generate chapter content using LLM
      if (book.type === 'bible' || book.title.toLowerCase().includes('bible')) {
        generateBibleChapterContent(book, chapterNumber).then(chapter => {
          sendJsonResponse(200, { success: true, data: chapter });
        }).catch(error => {
          sendJsonResponse(500, { success: false, error: error.message });
        });
        return;
      }

      sendJsonResponse(404, { success: false, error: 'Chapter not found' });
    }).catch(error => {
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

  return false;
}

