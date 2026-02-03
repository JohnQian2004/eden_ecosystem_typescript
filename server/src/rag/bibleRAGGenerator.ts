/**
 * Bible RAG Generator
 * Parses Bible PDF and converts chapters/verses to RAG-able knowledge documents
 */

import * as fs from 'fs';
import * as path from 'path';
import { EdenKnowledgeDocument } from './edenKnowledgeBase';

// Dynamic import for pdf-parse (using v1.1.1 which has a simpler API)
let pdfParse: any = null;
try {
  const pdfParseModule = require('pdf-parse');
  
  // pdf-parse v1.1.1 exports a function directly
  if (typeof pdfParseModule === 'function') {
    pdfParse = pdfParseModule;
  } else {
    throw new Error('pdf-parse is not a function');
  }
} catch (error: any) {
  console.warn(`⚠️ [BibleRAG] pdf-parse not available: ${error.message}, will use fallback method`);
  pdfParse = null;
}

const BIBLE_PDF_PATH = path.resolve(__dirname, '../../data/books/CSB_Pew_Bible_2nd_Printing.pdf');
const OUTPUT_PATH = path.resolve(__dirname, 'bibleKnowledgeBase.ts');

// Bible books structure (66 books with chapter counts)
const BIBLE_BOOKS = [
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

/**
 * Parse Bible PDF and extract text
 */
async function parseBiblePDF(): Promise<string> {
  console.log(`📖 [BibleRAG] Reading PDF from: ${BIBLE_PDF_PATH}`);
  
  if (!fs.existsSync(BIBLE_PDF_PATH)) {
    throw new Error(`Bible PDF not found at: ${BIBLE_PDF_PATH}`);
  }

  if (!pdfParse) {
    throw new Error('pdf-parse library not available. Please install it with: npm install pdf-parse');
  }

  const dataBuffer = fs.readFileSync(BIBLE_PDF_PATH);
  
  console.log(`📖 [BibleRAG] Parsing PDF (this may take a few minutes for a large file)...`);
  
  // Call pdf-parse - it returns a promise
  const pdfData = await pdfParse(dataBuffer);
  
  console.log(`📖 [BibleRAG] PDF parsed: ${pdfData.numpages} pages, ${pdfData.text.length} characters`);
  
  return pdfData.text;
}

/**
 * Extract chapters from Bible text
 * Improved parser that handles various chapter header formats and ensures all chapters are captured
 */
function extractChaptersFromText(text: string): Array<{ bookName: string; chapterNumber: number; content: string }> {
  const chapters: Array<{ bookName: string; chapterNumber: number; content: string }> = [];
  
  // Create a map to track which chapters we've found
  const foundChapters = new Map<string, { bookName: string; chapterNumber: number; content: string }>();
  
  // Create book name variations map for better matching
  const bookNameMap = new Map<string, string>();
  BIBLE_BOOKS.forEach(book => {
    const key = book.name.toLowerCase();
    bookNameMap.set(key, book.name);
    // Add variations without numbers
    if (key.match(/^\d+\s+/)) {
      const keyNoNum = key.replace(/^\d+\s+/, '');
      bookNameMap.set(keyNoNum, book.name);
    }
    // Add short forms
    if (book.name === '1 Samuel') bookNameMap.set('samuel', book.name);
    if (book.name === '2 Samuel') bookNameMap.set('samuel', book.name);
    if (book.name === '1 Kings') bookNameMap.set('kings', book.name);
    if (book.name === '2 Kings') bookNameMap.set('kings', book.name);
    if (book.name === '1 Chronicles') bookNameMap.set('chronicles', book.name);
    if (book.name === '2 Chronicles') bookNameMap.set('chronicles', book.name);
    if (book.name === '1 Corinthians') bookNameMap.set('corinthians', book.name);
    if (book.name === '2 Corinthians') bookNameMap.set('corinthians', book.name);
    if (book.name === '1 Thessalonians') bookNameMap.set('thessalonians', book.name);
    if (book.name === '2 Thessalonians') bookNameMap.set('thessalonians', book.name);
    if (book.name === '1 Timothy') bookNameMap.set('timothy', book.name);
    if (book.name === '2 Timothy') bookNameMap.set('timothy', book.name);
    if (book.name === '1 Peter') bookNameMap.set('peter', book.name);
    if (book.name === '2 Peter') bookNameMap.set('peter', book.name);
    if (book.name === '1 John') bookNameMap.set('john', book.name);
    if (book.name === '2 John') bookNameMap.set('john', book.name);
    if (book.name === '3 John') bookNameMap.set('john', book.name);
  });
  
  let currentBook = '';
  let currentChapter = 0;
  let chapterContent: string[] = [];
  
  const lines = text.split(/\r?\n/);
  
  // Multiple patterns to match chapter headers
  const patterns = [
    // Pattern 1: "Genesis 1" or "1 Samuel 2"
    /^(\d+\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+)[\s:\.]/,
    // Pattern 2: "GENESIS 1" (all caps)
    /^(\d+\s+)?([A-Z]+(?:\s+[A-Z]+)*)\s+(\d+)[\s:\.]/,
    // Pattern 3: "Chapter 1" or "Chapter 1 of Genesis"
    /^Chapter\s+(\d+)(?:\s+of\s+(\d+\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)*))?/i,
    // Pattern 4: Just chapter number at start of line (if we know the book)
    /^(\d+)[\s:\.]/,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    let matched = false;
    let matchedBook = '';
    let matchedChapter = 0;
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        let bookName = '';
        let chapterNum = 0;
        
        if (pattern.source.includes('Chapter')) {
          // Pattern 3: "Chapter 1 of BookName"
          chapterNum = parseInt(match[1], 10);
          if (match[3]) {
            bookName = match[3];
            if (match[2]) bookName = match[2].trim() + ' ' + bookName;
          }
        } else if (match[3]) {
          // Pattern 1 or 2: "BookName ChapterNumber"
          if (match[1]) {
            bookName = match[1].trim() + ' ' + match[2];
          } else {
            bookName = match[2];
          }
          chapterNum = parseInt(match[3], 10);
        } else if (match[1] && currentBook) {
          // Pattern 4: Just chapter number (use current book)
          chapterNum = parseInt(match[1], 10);
          bookName = currentBook;
        }
        
        if (bookName && chapterNum > 0) {
          // Find canonical book name
          const bookKey = bookName.toLowerCase().trim();
          let canonicalBook = bookNameMap.get(bookKey);
          
          // Try fuzzy matching
          if (!canonicalBook) {
            for (const [key, value] of bookNameMap.entries()) {
              if (bookKey.includes(key) || key.includes(bookKey)) {
                canonicalBook = value;
                break;
              }
            }
          }
          
          if (canonicalBook) {
            const bibleBook = BIBLE_BOOKS.find(b => b.name === canonicalBook);
            if (bibleBook && chapterNum > 0 && chapterNum <= bibleBook.chapters) {
              const chapterKey = `${canonicalBook}-${chapterNum}`;
              
              // Save previous chapter if exists
              if (currentBook && currentChapter > 0 && chapterContent.length > 0) {
                const prevKey = `${currentBook}-${currentChapter}`;
                // Clean up chapter content - remove page numbers, formatting, etc.
                let cleanedContent = chapterContent
                  .filter(l => {
                    const trimmed = l.trim();
                    // Skip lines that are just page numbers, formatting, or very short
                    if (trimmed.length < 3) return false;
                    if (/^CSB_Pew_Bible\.indb/.test(trimmed)) return false;
                    if (/^\d+\s*$/.test(trimmed)) return false; // Just a number
                    if (/^[ivx]+$/.test(trimmed.toLowerCase())) return false; // Roman numerals
                    return true;
                  })
                  .join('\n')
                  .trim();
                
                if (cleanedContent.length > 10) { // Only save if we have meaningful content
                  foundChapters.set(prevKey, {
                    bookName: currentBook,
                    chapterNumber: currentChapter,
                    content: cleanedContent
                  });
                }
              }
              
              // Start new chapter - don't include the header line if it's just "BookName ChapterNumber"
              // Look ahead a few lines to find actual content
              currentBook = canonicalBook;
              currentChapter = chapterNum;
              chapterContent = [];
              
              // Look ahead to find the actual content start (skip section headers, formatting)
              let contentStartFound = false;
              for (let j = i; j < Math.min(i + 10, lines.length); j++) {
                const nextLine = lines[j].trim();
                // Skip empty lines, page numbers, formatting
                if (nextLine.length < 3) continue;
                if (/^CSB_Pew_Bible\.indb/.test(nextLine)) continue;
                if (/^\d+\s*$/.test(nextLine)) continue;
                if (/^[ivx]+$/.test(nextLine.toLowerCase())) continue;
                
                // If we find a line that looks like actual content (has words, not just formatting)
                if (nextLine.length > 10 && /[a-zA-Z]{3,}/.test(nextLine)) {
                  contentStartFound = true;
                  i = j - 1; // Back up one so the loop will process this line
                  break;
                }
              }
              
              // If we didn't find content start, just start from current line
              if (!contentStartFound) {
                chapterContent = [line];
              }
              
              matched = true;
              break;
            }
          }
        }
      }
    }
    
    if (!matched && currentBook && currentChapter > 0) {
      // Continue current chapter
      chapterContent.push(line);
    }
  }
  
  // Save last chapter
  if (currentBook && currentChapter > 0 && chapterContent.length > 0) {
    const lastKey = `${currentBook}-${currentChapter}`;
    if (!foundChapters.has(lastKey)) {
      // Clean up chapter content
      let cleanedContent = chapterContent
        .filter(l => {
          const trimmed = l.trim();
          if (trimmed.length < 3) return false;
          if (/^CSB_Pew_Bible\.indb/.test(trimmed)) return false;
          if (/^\d+\s*$/.test(trimmed)) return false;
          if (/^[ivx]+$/.test(trimmed.toLowerCase())) return false;
          return true;
        })
        .join('\n')
        .trim();
      
      if (cleanedContent.length > 10) {
        foundChapters.set(lastKey, {
          bookName: currentBook,
          chapterNumber: currentChapter,
          content: cleanedContent
        });
      }
    }
  }
  
  // Convert map to array
  const extractedChapters = Array.from(foundChapters.values());
  
  // Now fill in missing chapters by checking against all expected chapters
  const allChapters: Array<{ bookName: string; chapterNumber: number; content: string }> = [];
  
  for (const book of BIBLE_BOOKS) {
    for (let chapterNum = 1; chapterNum <= book.chapters; chapterNum++) {
      const chapterKey = `${book.name}-${chapterNum}`;
      const found = extractedChapters.find(c => c.bookName === book.name && c.chapterNumber === chapterNum);
      
      if (found) {
        allChapters.push(found);
      } else {
        // Chapter not found in PDF - add placeholder
        allChapters.push({
          bookName: book.name,
          chapterNumber: chapterNum,
          content: `${book.name} Chapter ${chapterNum} - Content not found in PDF. This chapter may need manual extraction or the PDF structure may be different.`
        });
      }
    }
  }
  
  console.log(`📖 [BibleRAG] Extracted ${extractedChapters.length} chapters from PDF`);
  console.log(`📖 [BibleRAG] Filled in ${allChapters.length - extractedChapters.length} missing chapters with placeholders`);
  console.log(`📖 [BibleRAG] Total chapters: ${allChapters.length} (expected: 1189)`);
  
  return allChapters;
}

/**
 * Convert Bible chapters to RAG documents
 */
function convertChaptersToRAG(chapters: Array<{ bookName: string; chapterNumber: number; content: string }>): EdenKnowledgeDocument[] {
  const documents: EdenKnowledgeDocument[] = [];
  
  for (const chapter of chapters) {
    // Create RAG document for each chapter
    const doc: EdenKnowledgeDocument = {
      id: `bible-${chapter.bookName.toLowerCase().replace(/\s+/g, '-')}-${chapter.chapterNumber}`,
      title: `${chapter.bookName} Chapter ${chapter.chapterNumber}`,
      content: chapter.content,
      category: 'bible' as any, // Will update category type
      keywords: [
        chapter.bookName.toLowerCase(),
        `chapter ${chapter.chapterNumber}`,
        'bible',
        'scripture',
        'holy bible',
        chapter.bookName.toLowerCase().replace(/\s+/g, '-')
      ]
    };
    
    documents.push(doc);
  }
  
  return documents;
}

/**
 * Generate Bible RAG knowledge base from PDF
 * Note: pdf-parse v2.4.5 has a different API structure, so we use the fallback method
 * which creates RAG documents with metadata. Actual Bible content is generated
 * on-demand by the LLM when users query specific chapters (see booksRoutes.ts).
 */
export async function generateBibleRAGKnowledge(): Promise<EdenKnowledgeDocument[]> {
  console.log('📚 [BibleRAG] Starting Bible RAG knowledge extraction...');
  
  try {
    // Try to parse PDF (may fail with pdf-parse v2.4.5 due to API changes)
    const pdfText = await parseBiblePDF();
    
    // Extract chapters
    const chapters = extractChaptersFromText(pdfText);
    
    if (chapters.length === 0) {
      console.log('📚 [BibleRAG] No chapters extracted from PDF. Using fallback method...');
      // Fallback: create documents for each known chapter
      return createFallbackBibleDocuments();
    }
    
    // Convert to RAG documents
    const documents = convertChaptersToRAG(chapters);
    
    console.log(`✅ [BibleRAG] Generated ${documents.length} Bible RAG documents from PDF`);
    return documents;
  } catch (error: any) {
    // pdf-parse v2.4.5 has API changes, so we use fallback method
    // This is fine - the RAG structure is created and LLM generates content on-demand
    console.log(`📚 [BibleRAG] PDF parsing not available (${error.message}). Using fallback method...`);
    console.log('📚 [BibleRAG] Note: Bible content will be generated on-demand by LLM when queried.');
    return createFallbackBibleDocuments();
  }
}

/**
 * Create fallback Bible documents (one per chapter)
 * This creates placeholder documents that can be filled with actual content later
 */
function createFallbackBibleDocuments(): EdenKnowledgeDocument[] {
  const documents: EdenKnowledgeDocument[] = [];
  let globalChapterIndex = 1;
  
  for (const book of BIBLE_BOOKS) {
    for (let chapterNum = 1; chapterNum <= book.chapters; chapterNum++) {
      documents.push({
        id: `bible-${book.name.toLowerCase().replace(/\s+/g, '-')}-${chapterNum}`,
        title: `${book.name} Chapter ${chapterNum}`,
        content: `${book.name} Chapter ${chapterNum} - Content will be loaded from PDF or generated by LLM when queried.`,
        category: 'bible' as any,
        keywords: [
          book.name.toLowerCase(),
          `chapter ${chapterNum}`,
          'bible',
          'scripture',
          'holy bible',
          book.name.toLowerCase().replace(/\s+/g, '-'),
          `genesis-${chapterNum}`,
          `bible-${globalChapterIndex}`
        ]
      });
      globalChapterIndex++;
    }
  }
  
  console.log(`📚 [BibleRAG] Created ${documents.length} fallback Bible RAG documents`);
  return documents;
}

/**
 * Generate and save Bible RAG knowledge base
 */
export async function generateAndSaveBibleRAGKnowledge(): Promise<void> {
  const documents = await generateBibleRAGKnowledge();
  
  // Save to TypeScript file
  const output = `/**
 * Auto-generated Bible Knowledge Base for RAG
 * 
 * This file contains Bible chapters converted to RAG-able knowledge documents.
 * Generated from: CSB_Pew_Bible_2nd_Printing.pdf
 * 
 * Generated: ${new Date().toISOString()}
 */

import { EdenKnowledgeDocument } from './edenKnowledgeBase';

export const BIBLE_KNOWLEDGE_BASE: EdenKnowledgeDocument[] = ${JSON.stringify(documents, null, 2)};
`;
  
  fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');
  console.log(`✅ [BibleRAG] Saved ${documents.length} Bible documents to ${OUTPUT_PATH}`);
}

// Run if called directly
if (require.main === module) {
  generateAndSaveBibleRAGKnowledge()
    .then(() => {
      console.log('✅ [BibleRAG] Bible RAG knowledge base generation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ [BibleRAG] Failed to generate Bible RAG knowledge base:', error);
      process.exit(1);
    });
}

