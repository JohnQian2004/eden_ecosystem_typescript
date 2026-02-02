import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getApiBaseUrl } from '../../services/api-base';

interface Book {
  id: string;
  title: string;
  author?: string;
  description?: string;
  chapters?: number;
  type: 'bible' | 'book';
}

interface Chapter {
  id: string;
  bookId: string;
  number: number;
  title: string;
  content: string;
  verses?: Verse[];
}

interface Verse {
  number: number;
  text: string;
}

interface BibleBook {
  name: string;
  chapters: number;
  bookNumber: number; // 1-66
}

@Component({
  selector: 'app-eden-bible',
  templateUrl: './eden-bible.component.html',
  styleUrls: ['./eden-bible.component.scss']
})
export class EdenBibleComponent implements OnInit, OnDestroy {
  books: Book[] = [];
  bibleBooks: BibleBook[] = []; // The 66 Bible books
  selectedBibleBook: BibleBook | null = null; // Selected Bible book (Genesis, Exodus, etc.)
  selectedBook: Book | null = null; // The "Eden Bible" container book
  chapters: Chapter[] = [];
  filteredChapters: Chapter[] = [];
  selectedChapter: Chapter | null = null;
  isLoading = false;
  chapterSearchQuery = ''; // Search query for chapters
  isPlaying = false;
  currentAudio: HTMLAudioElement | null = null;
  speechSynthesis: SpeechSynthesis | null = null;
  private apiUrl = getApiBaseUrl();
  private mediaServerUrl = ''; // Media server URL - proxied through main server (HTTPS)

  constructor(
    private http: HttpClient
  ) {
    this.speechSynthesis = window.speechSynthesis;
    // Use the main API URL which proxies to port 3001 internally
    // This avoids mixed content warnings by serving everything over HTTPS
    this.mediaServerUrl = this.apiUrl; // Main server proxies /image to port 3001
    console.log(`[EdenBible] Media server URL (proxied via main server): ${this.mediaServerUrl}`);
  }

  ngOnInit(): void {
    this.loadBibleBooks();
  }

  loadBibleBooks(): void {
    this.isLoading = true;
    this.http.get<{ success: boolean; data: Book[] }>(`${this.apiUrl}/api/books/list`)
      .subscribe({
        next: (response) => {
          console.log(`[EdenBible] API response:`, response);
          const allBooks = response.data || [];
          console.log(`[EdenBible] Total books received: ${allBooks.length}`);
          
          // Filter to only Bible books
          const bibleBooks = allBooks.filter(book => 
            book.type === 'bible' || book.title.toLowerCase().includes('bible')
          );
          console.log(`[EdenBible] Bible books found: ${bibleBooks.length}`, bibleBooks.map(b => ({ id: b.id, title: b.title, type: b.type })));
          
          // If no Bible books found, create default Eden Bible
          if (bibleBooks.length === 0) {
            console.log(`[EdenBible] No Bible books found, creating default Eden Bible`);
            this.books = [{
              id: 'eden-bible',
              title: 'Eden Bible',
              author: 'Various',
              description: 'The complete Bible with all 66 books and 1,189 chapters. Content is generated using AI for accurate biblical text.',
              chapters: 1189,
              type: 'bible'
            }];
          } else {
            // Sort: Eden Bible ALWAYS first, then other Bible books
            this.books = bibleBooks.sort((a, b) => {
              // Check if it's specifically "Eden Bible"
              const aIsEdenBible = a.title.toLowerCase() === 'eden bible' || (a.id === 'eden-bible');
              const bIsEdenBible = b.title.toLowerCase() === 'eden bible' || (b.id === 'eden-bible');
              
              // Eden Bible is ALWAYS first
              if (aIsEdenBible && !bIsEdenBible) return -1;
              if (!aIsEdenBible && bIsEdenBible) return 1;
              
              // If both are Bible (but not Eden Bible), sort by title
              return a.title.localeCompare(b.title);
            });
          }
          // Set the Eden Bible as the selected book container
          const edenBible = this.books.find(b => b.id === 'eden-bible' || b.title.toLowerCase() === 'eden bible');
          if (edenBible) {
            this.selectedBook = edenBible;
          }
          
          // Initialize the 66 Bible books structure
          this.initializeBibleBooks();
          
          console.log(`[EdenBible] Bible books loaded in order: ${this.books.map(b => b.title).join(', ')}`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Failed to load Bible books:', error);
          // Create default Eden Bible if API fails
          this.books = [{
            id: 'eden-bible',
            title: 'Eden Bible',
            author: 'Various',
            description: 'The complete Bible with all 66 books and 1,189 chapters. Content is generated using AI for accurate biblical text.',
            chapters: 1189,
            type: 'bible'
          }];
          
          // Set the Eden Bible as the selected book container
          this.selectedBook = this.books[0];
          
          // Initialize the 66 Bible books structure
          this.initializeBibleBooks();
          
          this.isLoading = false;
        }
      });
  }

  /**
   * Initialize the 66 Bible books structure
   */
  private initializeBibleBooks(): void {
    this.bibleBooks = [
      { name: 'Genesis', chapters: 50, bookNumber: 1 },
      { name: 'Exodus', chapters: 40, bookNumber: 2 },
      { name: 'Leviticus', chapters: 27, bookNumber: 3 },
      { name: 'Numbers', chapters: 36, bookNumber: 4 },
      { name: 'Deuteronomy', chapters: 34, bookNumber: 5 },
      { name: 'Joshua', chapters: 24, bookNumber: 6 },
      { name: 'Judges', chapters: 21, bookNumber: 7 },
      { name: 'Ruth', chapters: 4, bookNumber: 8 },
      { name: '1 Samuel', chapters: 31, bookNumber: 9 },
      { name: '2 Samuel', chapters: 24, bookNumber: 10 },
      { name: '1 Kings', chapters: 22, bookNumber: 11 },
      { name: '2 Kings', chapters: 25, bookNumber: 12 },
      { name: '1 Chronicles', chapters: 29, bookNumber: 13 },
      { name: '2 Chronicles', chapters: 36, bookNumber: 14 },
      { name: 'Ezra', chapters: 10, bookNumber: 15 },
      { name: 'Nehemiah', chapters: 13, bookNumber: 16 },
      { name: 'Esther', chapters: 10, bookNumber: 17 },
      { name: 'Job', chapters: 42, bookNumber: 18 },
      { name: 'Psalms', chapters: 150, bookNumber: 19 },
      { name: 'Proverbs', chapters: 31, bookNumber: 20 },
      { name: 'Ecclesiastes', chapters: 12, bookNumber: 21 },
      { name: 'Song of Songs', chapters: 8, bookNumber: 22 },
      { name: 'Isaiah', chapters: 66, bookNumber: 23 },
      { name: 'Jeremiah', chapters: 52, bookNumber: 24 },
      { name: 'Lamentations', chapters: 5, bookNumber: 25 },
      { name: 'Ezekiel', chapters: 48, bookNumber: 26 },
      { name: 'Daniel', chapters: 12, bookNumber: 27 },
      { name: 'Hosea', chapters: 14, bookNumber: 28 },
      { name: 'Joel', chapters: 3, bookNumber: 29 },
      { name: 'Amos', chapters: 9, bookNumber: 30 },
      { name: 'Obadiah', chapters: 1, bookNumber: 31 },
      { name: 'Jonah', chapters: 4, bookNumber: 32 },
      { name: 'Micah', chapters: 7, bookNumber: 33 },
      { name: 'Nahum', chapters: 3, bookNumber: 34 },
      { name: 'Habakkuk', chapters: 3, bookNumber: 35 },
      { name: 'Zephaniah', chapters: 3, bookNumber: 36 },
      { name: 'Haggai', chapters: 2, bookNumber: 37 },
      { name: 'Zechariah', chapters: 14, bookNumber: 38 },
      { name: 'Malachi', chapters: 4, bookNumber: 39 },
      { name: 'Matthew', chapters: 28, bookNumber: 40 },
      { name: 'Mark', chapters: 16, bookNumber: 41 },
      { name: 'Luke', chapters: 24, bookNumber: 42 },
      { name: 'John', chapters: 21, bookNumber: 43 },
      { name: 'Acts', chapters: 28, bookNumber: 44 },
      { name: 'Romans', chapters: 16, bookNumber: 45 },
      { name: '1 Corinthians', chapters: 16, bookNumber: 46 },
      { name: '2 Corinthians', chapters: 13, bookNumber: 47 },
      { name: 'Galatians', chapters: 6, bookNumber: 48 },
      { name: 'Ephesians', chapters: 6, bookNumber: 49 },
      { name: 'Philippians', chapters: 4, bookNumber: 50 },
      { name: 'Colossians', chapters: 4, bookNumber: 51 },
      { name: '1 Thessalonians', chapters: 5, bookNumber: 52 },
      { name: '2 Thessalonians', chapters: 3, bookNumber: 53 },
      { name: '1 Timothy', chapters: 6, bookNumber: 54 },
      { name: '2 Timothy', chapters: 4, bookNumber: 55 },
      { name: 'Titus', chapters: 3, bookNumber: 56 },
      { name: 'Philemon', chapters: 1, bookNumber: 57 },
      { name: 'Hebrews', chapters: 13, bookNumber: 58 },
      { name: 'James', chapters: 5, bookNumber: 59 },
      { name: '1 Peter', chapters: 5, bookNumber: 60 },
      { name: '2 Peter', chapters: 3, bookNumber: 61 },
      { name: '1 John', chapters: 5, bookNumber: 62 },
      { name: '2 John', chapters: 1, bookNumber: 63 },
      { name: '3 John', chapters: 1, bookNumber: 64 },
      { name: 'Jude', chapters: 1, bookNumber: 65 },
      { name: 'Revelation', chapters: 22, bookNumber: 66 }
    ];
  }

  /**
   * Select a Bible book (Genesis, Exodus, etc.) - Layer 1
   */
  selectBibleBook(bibleBook: BibleBook): void {
    this.selectedBibleBook = bibleBook;
    this.selectedChapter = null;
    this.chapterSearchQuery = '';
    this.loadChaptersForBook(bibleBook);
  }

  /**
   * Load chapters for a specific Bible book - Layer 2
   */
  loadChaptersForBook(bibleBook: BibleBook): void {
    this.isLoading = true;
    
    // Calculate the starting chapter number for this book
    let startChapterNumber = 1;
    for (let i = 0; i < bibleBook.bookNumber - 1; i++) {
      startChapterNumber += this.bibleBooks[i].chapters;
    }
    
    // Generate chapters for this specific book
    const chapters: Chapter[] = [];
    for (let i = 1; i <= bibleBook.chapters; i++) {
      chapters.push({
        id: `chapter-${startChapterNumber + i - 1}`,
        bookId: this.selectedBook?.id || 'eden-bible',
        number: startChapterNumber + i - 1, // Global chapter number (1-1189)
        title: `${bibleBook.name} Chapter ${i}`,
        content: '' // Content will be fetched from LLM when clicked
      });
    }
    
    this.chapters = chapters;
    this.filteredChapters = [...chapters];
    this.isLoading = false;
    console.log(`📖 [EdenBible] Loaded ${chapters.length} chapters for ${bibleBook.name}`);
  }

  selectBook(book: Book): void {
    this.selectedBook = book;
    this.selectedBibleBook = null;
    this.selectedChapter = null;
    this.chapters = [];
    this.filteredChapters = [];
  }

  selectChapter(chapter: Chapter): void {
    this.selectedChapter = chapter;
    
    // Always fetch content from LLM when chapter is clicked
    this.loadChapterContent(chapter);
    
    // Scroll to top when chapter is selected
    const contentElement = document.querySelector('.eden-bible-content');
    if (contentElement) {
      contentElement.scrollTop = 0;
    }
  }

  /**
   * Search chapters by title or content
   */
  searchChapters(): void {
    const query = this.chapterSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredChapters = [...this.chapters];
      return;
    }

    // Search by chapter title
    this.filteredChapters = this.chapters.filter(chapter => {
      const titleMatch = chapter.title.toLowerCase().includes(query);
      
      // If chapter has content, search in it too
      if (chapter.content) {
        const contentMatch = chapter.content.toLowerCase().includes(query);
        return titleMatch || contentMatch;
      }
      
      return titleMatch;
    });

    // Try searching in chapter titles more broadly if no results
    if (this.filteredChapters.length === 0) {
      const queryWords = query.split(/\s+/);
      this.filteredChapters = this.chapters.filter(chapter => {
        const titleLower = chapter.title.toLowerCase();
        return queryWords.some(word => titleLower.includes(word));
      });
    }
  }

  /**
   * Clear chapter search
   */
  clearChapterSearch(): void {
    this.chapterSearchQuery = '';
    this.filteredChapters = [...this.chapters];
  }

  loadChapterContent(chapter: Chapter): void {
    if (!this.selectedBook) return;
    
    // If chapter already has content, don't reload
    if (chapter.content && chapter.content.trim() !== '') {
      this.selectedChapter = chapter;
      return;
    }
    
    this.isLoading = true;
    console.log(`📖 [EdenBible] Fetching content for ${chapter.title} from LLM...`);
    
    // Fetch chapter content from LLM via API with timeout
    this.http.get<{ success: boolean; data: Chapter }>(`${this.apiUrl}/api/books/${this.selectedBook.id}/chapters/${chapter.number}`, {
      // Add timeout of 35 seconds (slightly longer than server timeout)
    })
      .subscribe({
        next: (response) => {
          if (response.data) {
            // Update the chapter in the chapters array with the fetched content
            const chapterIndex = this.chapters.findIndex(c => c.number === chapter.number);
            if (chapterIndex !== -1) {
              this.chapters[chapterIndex] = response.data;
              // Also update filtered chapters if it's in there
              const filteredIndex = this.filteredChapters.findIndex(c => c.number === chapter.number);
              if (filteredIndex !== -1) {
                this.filteredChapters[filteredIndex] = response.data;
              }
            }
            
            this.selectedChapter = response.data;
            this.isLoading = false;
            console.log(`✅ [EdenBible] Loaded content for ${chapter.title}`);
          } else {
            console.warn(`⚠️ [EdenBible] No data in response for ${chapter.title}`);
            this.isLoading = false;
          }
        },
        error: (error) => {
          console.error(`❌ [EdenBible] Failed to load chapter content for ${chapter.title}:`, error);
          // Show error message to user
          this.selectedChapter = {
            ...chapter,
            content: `Failed to load content: ${error.message || 'Unknown error'}. Please try again.`
          };
          this.isLoading = false;
        }
      });
  }

  goBack(): void {
    if (this.selectedChapter) {
      // Go back from chapter to book chapters list
      this.selectedChapter = null;
    } else if (this.selectedBibleBook) {
      // Go back from book chapters to Bible books list
      this.selectedBibleBook = null;
      this.chapters = [];
      this.filteredChapters = [];
    } else if (this.selectedBook) {
      // Go back from Bible container to main view
      this.selectedBook = null;
    }
  }

  playAudio(): void {
    if (!this.selectedChapter) return;

    if (this.isPlaying && this.currentAudio) {
      // Stop current playback
      this.stopAudio();
      return;
    }

    const text = this.selectedChapter.content;
    if (this.speechSynthesis) {
      // Use Web Speech API
      this.speechSynthesis.cancel(); // Cancel any ongoing speech
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        this.isPlaying = true;
      };

      utterance.onend = () => {
        this.isPlaying = false;
      };

      utterance.onerror = (error) => {
        console.error('Speech synthesis error:', error);
        this.isPlaying = false;
      };

      this.speechSynthesis.speak(utterance);
    } else {
      // Fallback: Use TTS API endpoint
      this.http.post<{ success: boolean; audioUrl: string }>(`${this.apiUrl}/api/books/tts`, {
        text: text,
        bookId: this.selectedBook?.id,
        chapterId: this.selectedChapter.id
      }).subscribe({
        next: (response) => {
          if (response.audioUrl) {
            this.currentAudio = new Audio(response.audioUrl);
            this.currentAudio.play();
            this.isPlaying = true;

            this.currentAudio.onended = () => {
              this.isPlaying = false;
              this.currentAudio = null;
            };

            this.currentAudio.onerror = () => {
              this.isPlaying = false;
              this.currentAudio = null;
            };
          }
        },
        error: (error) => {
          console.error('Failed to generate audio:', error);
        }
      });
    }
  }

  stopAudio(): void {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }

  ngOnDestroy(): void {
    this.stopAudio();
  }

  /**
   * Get paragraphs from chapter content (for template use)
   */
  getChapterParagraphs(content: string | undefined): string[] {
    if (!content) return [];
    return content.split('\n\n').filter(p => p.trim());
  }

  /**
   * Get background image URL for a book using media server
   */
  getBookBackgroundImage(book: Book): string {
    // Generate a consistent random number based on book ID
    let hash = 0;
    for (let i = 0; i < book.id.length; i++) {
      const char = book.id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to positive 6-digit number
    const random = Math.abs(hash).toString().padStart(6, '0').substring(0, 6);
    return `${this.mediaServerUrl}/image?random=${random}`;
  }
}

