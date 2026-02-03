import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface HistoricalEvent {
  id: string;
  title: string;
  date: string;
  description: string;
  location: string;
  perspectives?: string[];
  relatedFigures?: string[];
}

interface HistoricalFigure {
  id: string;
  name: string;
  birthYear?: number;
  deathYear?: number;
  nationality: string;
  occupation: string;
  biography: string;
  keyEvents?: string[];
  writings?: string[];
}

interface TimelinePeriod {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  description: string;
  globalEvents: HistoricalEvent[];
}

@Component({
  selector: 'app-eden-history',
  templateUrl: './eden-history.component.html',
  styleUrls: ['./eden-history.component.scss']
})
export class EdenHistoryComponent implements OnInit {
  apiUrl = 'https://50.76.0.85:3000';
  
  // View modes
  viewMode: 'timeline' | 'biography' | 'autobiography' | 'whatif' = 'timeline';
  
  // Timeline data
  selectedPeriod: TimelinePeriod | null = null;
  selectedEvent: HistoricalEvent | null = null;
  periods: TimelinePeriod[] = [];
  isLoadingPeriods = false;
  
  // Biography data
  selectedFigure: HistoricalFigure | null = null;
  figures: HistoricalFigure[] = [];
  isLoadingFigures = false;
  
  // Autobiography/Conversation mode
  conversationMode = false;
  conversationHistory: Array<{ role: 'user' | 'figure'; content: string }> = [];
  currentQuestion = '';
  isGeneratingResponse = false;
  
  // What-if scenarios
  whatIfScenario = '';
  whatIfResult = '';
  isGeneratingWhatIf = false;
  
  // Search
  searchQuery = '';
  searchResults: Array<HistoricalEvent | HistoricalFigure> = [];
  
  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * Helper method to get title from search result
   */
  getResultTitle(result: HistoricalEvent | HistoricalFigure): string {
    if ('title' in result) {
      return result.title;
    }
    return (result as HistoricalFigure).name;
  }

  /**
   * Helper method to get description from search result
   */
  getResultDescription(result: HistoricalEvent | HistoricalFigure): string {
    if ('description' in result) {
      return result.description;
    }
    return (result as HistoricalFigure).biography;
  }

  /**
   * Check if result is a HistoricalEvent
   */
  isEvent(result: HistoricalEvent | HistoricalFigure): result is HistoricalEvent {
    return 'title' in result;
  }

  /**
   * Check if result is a HistoricalFigure
   */
  isFigure(result: HistoricalEvent | HistoricalFigure): result is HistoricalFigure {
    return 'name' in result;
  }

  /**
   * Format year for display (handles BC/AD)
   */
  formatYear(year: number | undefined): string {
    if (year === undefined || year === null) return '';
    return year < 0 ? Math.abs(year) + ' BC' : year + ' AD';
  }

  /**
   * Get absolute value of a number (for template use)
   */
  abs(value: number | undefined): number {
    if (value === undefined || value === null) return 0;
    return Math.abs(value);
  }


  ngOnInit(): void {
    this.loadTimelinePeriods();
    this.loadHistoricalFigures();
  }


  /**
   * Load timeline periods from backend
   */
  loadTimelinePeriods(): void {
    this.isLoadingPeriods = true;
    console.log('📜 [EdenHistory] Loading periods from:', `${this.apiUrl}/api/history/periods`);
    this.http.get<TimelinePeriod[]>(`${this.apiUrl}/api/history/periods`).subscribe({
      next: (periods) => {
        console.log('📜 [EdenHistory] Received periods:', periods.length, periods);
        this.periods = periods;
        this.isLoadingPeriods = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ [EdenHistory] Failed to load timeline periods:', error);
        this.isLoadingPeriods = false;
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Load historical figures from backend
   */
  loadHistoricalFigures(): void {
    this.isLoadingFigures = true;
    console.log('👤 [EdenHistory] Loading figures from:', `${this.apiUrl}/api/history/figures`);
    this.http.get<HistoricalFigure[]>(`${this.apiUrl}/api/history/figures`).subscribe({
      next: (figures) => {
        console.log('👤 [EdenHistory] Received figures:', figures.length, figures);
        this.figures = figures;
        this.isLoadingFigures = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ [EdenHistory] Failed to load historical figures:', error);
        this.isLoadingFigures = false;
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Select a timeline period
   */
  selectPeriod(period: TimelinePeriod): void {
    this.selectedPeriod = period;
    this.viewMode = 'timeline';
    
    // If period has no events or events array is empty, generate them
    if (!period.globalEvents || period.globalEvents.length === 0) {
      this.loadPeriodEvents(period.id);
    }
  }

  /**
   * Load events for a period (generated by LLM)
   */
  loadPeriodEvents(periodId: string): void {
    this.http.get<HistoricalEvent[]>(`${this.apiUrl}/api/history/periods/${periodId}/events`).subscribe({
      next: (events) => {
        if (this.selectedPeriod && this.selectedPeriod.id === periodId) {
          this.selectedPeriod.globalEvents = events;
        }
        // Also update in periods array
        const period = this.periods.find(p => p.id === periodId);
        if (period) {
          period.globalEvents = events;
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Failed to load period events:', error);
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Select an event to view details
   */
  selectEvent(event: HistoricalEvent): void {
    this.selectedEvent = event;
    console.log('📅 [EdenHistory] Selected event:', event.title);
  }

  /**
   * Find and select a figure by name (from related figures in events)
   */
  selectFigureByName(figureName: string): void {
    // Try to find exact match first
    let figure = this.figures.find(f => 
      f.name.toLowerCase() === figureName.toLowerCase()
    );

    // If no exact match, try partial match
    if (!figure) {
      figure = this.figures.find(f => 
        f.name.toLowerCase().includes(figureName.toLowerCase()) ||
        figureName.toLowerCase().includes(f.name.toLowerCase())
      );
    }

    if (figure) {
      console.log('👤 [EdenHistory] Found figure by name:', figureName, '→', figure.name);
      this.selectFigure(figure);
      // Clear the event view to show the figure
      this.selectedEvent = null;
    } else {
      console.warn('⚠️ [EdenHistory] Figure not found:', figureName);
      // Optionally, you could show a message to the user
    }
  }

  /**
   * Select a historical figure
   */
  selectFigure(figure: HistoricalFigure): void {
    this.selectedFigure = figure;
    this.viewMode = 'biography';
    this.conversationHistory = [];
  }

  /**
   * Start autobiography/conversation mode with a historical figure
   */
  startConversation(figure: HistoricalFigure): void {
    this.selectedFigure = figure;
    this.viewMode = 'autobiography';
    this.conversationMode = true;
    this.conversationHistory = [{
      role: 'figure',
      content: `Greetings. I am ${figure.name}. ${figure.biography.substring(0, 200)}... What would you like to know about my life, my thoughts, or the times in which I lived?`
    }];
  }

  /**
   * Ask a question to the historical figure
   */
  askQuestion(): void {
    if (!this.currentQuestion.trim() || !this.selectedFigure || this.isGeneratingResponse) {
      return;
    }

    const question = this.currentQuestion.trim();
    this.conversationHistory.push({ role: 'user', content: question });
    this.currentQuestion = '';
    this.isGeneratingResponse = true;

    this.http.post<{ response: string }>(`${this.apiUrl}/api/history/autobiography/ask`, {
      figureId: this.selectedFigure.id,
      question: question,
      conversationHistory: this.conversationHistory.slice(0, -1) // Exclude current question
    }).subscribe({
      next: (result) => {
        this.conversationHistory.push({ role: 'figure', content: result.response });
        this.isGeneratingResponse = false;
      },
      error: (error) => {
        console.error('Failed to get response:', error);
        this.conversationHistory.push({
          role: 'figure',
          content: 'I apologize, but I am having difficulty responding at this moment. Please try again.'
        });
        this.isGeneratingResponse = false;
      }
    });
  }

  /**
   * Generate a what-if historical scenario
   */
  generateWhatIf(): void {
    if (!this.whatIfScenario.trim() || this.isGeneratingWhatIf) {
      return;
    }

    this.isGeneratingWhatIf = true;
    this.http.post<{ result: string }>(`${this.apiUrl}/api/history/whatif`, {
      scenario: this.whatIfScenario.trim()
    }).subscribe({
      next: (result) => {
        this.whatIfResult = result.result;
        this.isGeneratingWhatIf = false;
      },
      error: (error) => {
        console.error('Failed to generate what-if scenario:', error);
        this.whatIfResult = 'I apologize, but I am having difficulty generating this scenario. Please try again.';
        this.isGeneratingWhatIf = false;
      }
    });
  }

  /**
   * Search historical events and figures
   */
  search(): void {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      // Clear display area
      this.selectedPeriod = null;
      this.selectedFigure = null;
      this.cdr.detectChanges();
      return;
    }

    // Clear display area first to ensure search results are visible
    console.log('🔍 [EdenHistory] Clearing display area and searching for:', this.searchQuery.trim());
    this.selectedPeriod = null;
    this.selectedFigure = null;
    this.searchResults = []; // Clear previous results
    this.cdr.detectChanges();

    console.log('🔍 [EdenHistory] Sending search request to:', `${this.apiUrl}/api/history/search`);
    this.http.post<Array<HistoricalEvent | HistoricalFigure>>(`${this.apiUrl}/api/history/search`, {
      query: this.searchQuery.trim()
    }).subscribe({
      next: (results) => {
        console.log('🔍 [EdenHistory] Search results received:', results.length, results);
        this.searchResults = results;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ [EdenHistory] Search failed:', error);
        this.searchResults = [];
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Format markdown-like text to HTML
   */
  formatText(text: string): SafeHtml {
    // Simple markdown formatting
    let formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    
    return this.sanitizer.sanitize(1, formatted) || '';
  }

  /**
   * Go back to main view
   */
  goBack(): void {
    // If viewing an event, go back to period view
    if (this.selectedEvent) {
      this.selectedEvent = null;
      return;
    }
    // Otherwise, go back to the main view
    this.selectedPeriod = null;
    this.selectedFigure = null;
    this.conversationMode = false;
    this.conversationHistory = [];
    this.whatIfScenario = '';
    this.whatIfResult = '';
  }
}


