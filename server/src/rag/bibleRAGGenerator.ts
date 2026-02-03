/**
 * Bible RAG Generator
 * Parses Bible PDF and converts chapters/verses to RAG-able knowledge documents
 */

import * as fs from 'fs';
import * as path from 'path';
import pdf from 'pdf-parse';
import { EdenKnowledgeDocument } from './edenKnowledgeBase';

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
  const pdfData = await pdfParse(dataBuffer);
  
  console.log(`📖 [BibleRAG] PDF parsed: ${pdfData.numpages} pages, ${pdfData.text.length} characters`);
  
  return pdfData.text;
}

/**
 * Extract chapters from Bible text
 * This is a simplified parser - you may need to adjust based on the PDF structure
 */
function extractChaptersFromText(text: string): Array<{ bookName: string; chapterNumber: number; content: string }> {
  const chapters: Array<{ bookName: string; chapterNumber: number; content: string }> = [];
  
  // Pattern to match chapter headers (e.g., "Genesis 1", "1 Samuel 2", etc.)
  // This regex looks for book names followed by chapter numbers
  const chapterPattern = /(\d+\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+)/g;
  
  let currentBook = '';
  let currentChapter = 0;
  let chapterContent: string[] = [];
  let globalChapterIndex = 1;
  
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Try to match chapter pattern
    const match = line.match(/^(\d+\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+)/);
    
    if (match) {
      const bookName = match[2];
      const chapterNum = parseInt(match[3], 10);
      
      // Check if this is a valid Bible book
      const bibleBook = BIBLE_BOOKS.find(b => 
        b.name.toLowerCase() === bookName.toLowerCase() ||
        b.name.toLowerCase().replace(/\s+/g, '').includes(bookName.toLowerCase())
      );
      
      if (bibleBook && chapterNum > 0 && chapterNum <= bibleBook.chapters) {
        // Save previous chapter if exists
        if (currentBook && currentChapter > 0 && chapterContent.length > 0) {
          chapters.push({
            bookName: currentBook,
            chapterNumber: currentChapter,
            content: chapterContent.join('\n').trim()
          });
        }
        
        // Start new chapter
        currentBook = bibleBook.name;
        currentChapter = chapterNum;
        chapterContent = [line];
        globalChapterIndex++;
      } else {
        // Continue current chapter
        if (currentBook && currentChapter > 0) {
          chapterContent.push(line);
        }
      }
    } else {
      // Continue current chapter
      if (currentBook && currentChapter > 0) {
        chapterContent.push(line);
      }
    }
  }
  
  // Save last chapter
  if (currentBook && currentChapter > 0 && chapterContent.length > 0) {
    chapters.push({
      bookName: currentBook,
      chapterNumber: currentChapter,
      content: chapterContent.join('\n').trim()
    });
  }
  
  console.log(`📖 [BibleRAG] Extracted ${chapters.length} chapters from PDF`);
  return chapters;
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
 */
export async function generateBibleRAGKnowledge(): Promise<EdenKnowledgeDocument[]> {
  console.log('📚 [BibleRAG] Starting Bible RAG knowledge extraction...');
  
  try {
    // Parse PDF
    const pdfText = await parseBiblePDF();
    
    // Extract chapters
    const chapters = extractChaptersFromText(pdfText);
    
    if (chapters.length === 0) {
      console.warn('⚠️ [BibleRAG] No chapters extracted. Using fallback method...');
      // Fallback: create documents for each known chapter
      return createFallbackBibleDocuments();
    }
    
    // Convert to RAG documents
    const documents = convertChaptersToRAG(chapters);
    
    console.log(`✅ [BibleRAG] Generated ${documents.length} Bible RAG documents`);
    return documents;
  } catch (error: any) {
    console.error(`❌ [BibleRAG] Error generating Bible RAG:`, error.message);
    console.log('📚 [BibleRAG] Using fallback method...');
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

