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

@Component({
  selector: 'app-eden-books',
  templateUrl: './eden-books.component.html',
  styleUrls: ['./eden-books.component.scss']
})
export class EdenBooksComponent implements OnInit, OnDestroy {
  books: Book[] = [];
  selectedBook: Book | null = null;
  chapters: Chapter[] = [];
  filteredChapters: Chapter[] = [];
  selectedChapter: Chapter | null = null;
  isLoading = false;
  searchQuery = '';
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
    // Use the main API URL which proxies to port 5000 internally
    // This avoids mixed content warnings by serving everything over HTTPS
    this.mediaServerUrl = this.apiUrl; // Main server proxies /image to port 5000
    console.log(`[EdenBooks] Media server URL (proxied via main server): ${this.mediaServerUrl}`);
  }

  ngOnInit(): void {
    this.loadBooks();
  }

  loadBooks(): void {
    this.isLoading = true;
    this.http.get<{ success: boolean; data: Book[] }>(`${this.apiUrl}/api/books/list`)
      .subscribe({
        next: (response) => {
          const books = response.data || [];
          // Sort: Eden Bible ALWAYS first, then other Bible books, then others
          this.books = books.sort((a, b) => {
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
          console.log(`[EdenBooks] Books loaded in order: ${this.books.map(b => b.title).join(', ')}`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Failed to load books:', error);
          this.isLoading = false;
        }
      });
  }

  selectBook(book: Book): void {
    this.selectedBook = book;
    this.selectedChapter = null;
    this.loadChapters(book.id);
  }

  loadChapters(bookId: string): void {
    this.isLoading = true;
    this.chapterSearchQuery = ''; // Reset chapter search when loading new book
    this.http.get<{ success: boolean; data: Chapter[] }>(`${this.apiUrl}/api/books/${bookId}/chapters`)
      .subscribe({
        next: (response) => {
          this.chapters = response.data || [];
          this.filteredChapters = [...this.chapters];
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Failed to load chapters:', error);
          this.isLoading = false;
        }
      });
  }

  selectChapter(chapter: Chapter): void {
    this.selectedChapter = chapter;
    
    // If chapter has no content or is a Bible chapter, fetch the content
    if ((!chapter.content || chapter.content.trim() === '') && this.selectedBook?.type === 'bible') {
      this.loadChapterContent(chapter);
    }
    
    // Scroll to top when chapter is selected
    const contentElement = document.querySelector('.eden-books-content');
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

    // For Bible, we can search by chapter title
    // If chapters have content loaded, we can also search in content
    this.filteredChapters = this.chapters.filter(chapter => {
      const titleMatch = chapter.title.toLowerCase().includes(query);
      
      // If chapter has content, search in it too
      if (chapter.content) {
        const contentMatch = chapter.content.toLowerCase().includes(query);
        return titleMatch || contentMatch;
      }
      
      return titleMatch;
    });

    // If it's a Bible and we have a search query, try to load and search chapter content
    if (this.selectedBook?.type === 'bible' && this.filteredChapters.length === 0) {
      // Try searching in chapter titles more broadly
      this.filteredChapters = this.chapters.filter(chapter => {
        // Search for keywords like "Garden Of Eden" in Genesis chapters
        const titleLower = chapter.title.toLowerCase();
        const queryWords = query.split(/\s+/);
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
    
    this.isLoading = true;
    this.http.get<{ success: boolean; data: Chapter }>(`${this.apiUrl}/api/books/${this.selectedBook.id}/chapters/${chapter.number}`)
      .subscribe({
        next: (response) => {
          if (response.data) {
            this.selectedChapter = response.data;
            this.isLoading = false;
          }
        },
        error: (error) => {
          console.error('Failed to load chapter content:', error);
          this.isLoading = false;
        }
      });
  }

  goBack(): void {
    if (this.selectedChapter) {
      this.selectedChapter = null;
    } else if (this.selectedBook) {
      this.selectedBook = null;
      this.chapters = [];
    }
  }

  searchBooks(): void {
    if (!this.searchQuery.trim()) {
      this.loadBooks();
      return;
    }

    this.isLoading = true;
    this.http.get<{ success: boolean; data: Book[] }>(`${this.apiUrl}/api/books/search?q=${encodeURIComponent(this.searchQuery)}`)
      .subscribe({
        next: (response) => {
          this.books = response.data || [];
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Failed to search books:', error);
          this.isLoading = false;
        }
      });
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
   * Clean description text (remove HTML tags and format)
   */
  cleanDescription(description: string | undefined): string {
    if (!description) return '';
    // Remove any remaining HTML tags
    let cleaned = description.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    cleaned = cleaned.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    cleaned = cleaned.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    cleaned = cleaned.replace(/&nbsp;/g, ' ');
    // Limit length for thumbnail display
    if (cleaned.length > 150) {
      cleaned = cleaned.substring(0, 150) + '...';
    }
    return cleaned.trim();
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

