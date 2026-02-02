import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getApiBaseUrl } from '../../services/api-base';

interface NewsFeed {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

interface NewsItem {
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

@Component({
  selector: 'app-eden-news',
  templateUrl: './eden-news.component.html',
  styleUrls: ['./eden-news.component.scss']
})
export class EdenNewsComponent implements OnInit, OnDestroy {
  feeds: NewsFeed[] = [];
  newsItems: NewsItem[] = [];
  isLoading: boolean = false;
  isRefreshing: boolean = false;
  selectedFeed: string | 'all' = 'all';
  searchQuery: string = '';
  private refreshInterval: any;
  private apiUrl = getApiBaseUrl();

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadFeeds();
    this.loadNews();
    // Auto-refresh every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.refreshNews();
    }, 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadFeeds(): Promise<void> {
    try {
      const response = await this.http.get<{success: boolean, feeds: NewsFeed[]}>(`${this.apiUrl}/api/news/feeds`).toPromise();
      if (response && response.success && response.feeds) {
        this.feeds = response.feeds;
        console.log('📰 [News] Loaded feeds:', this.feeds.length);
      }
    } catch (error) {
      console.error('📰 [News] Error loading feeds:', error);
    }
  }

  async loadNews(): Promise<void> {
    this.isLoading = true;
    try {
      const response = await this.http.get<{success: boolean, items: NewsItem[]}>(`${this.apiUrl}/api/news/items`).toPromise();
      if (response && response.success && response.items) {
        this.newsItems = response.items;
        console.log('📰 [News] Loaded news items:', this.newsItems.length);
      }
    } catch (error) {
      console.error('📰 [News] Error loading news:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async refreshNews(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    try {
      const response = await this.http.post<{success: boolean, items: NewsItem[]}>(`${this.apiUrl}/api/news/refresh`, {}).toPromise();
      if (response && response.success && response.items) {
        this.newsItems = response.items;
        console.log('📰 [News] Refreshed news items:', this.newsItems.length);
      }
    } catch (error) {
      console.error('📰 [News] Error refreshing news:', error);
    } finally {
      this.isRefreshing = false;
      this.cdr.detectChanges();
    }
  }

  getFilteredNewsItems(): NewsItem[] {
    let filtered = this.newsItems;
    
    // Filter by selected feed
    if (this.selectedFeed !== 'all') {
      filtered = filtered.filter(item => item.feedId === this.selectedFeed);
    }
    
    // Filter by search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.feedName.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  }

  openArticle(item: NewsItem): void {
    if (item.link) {
      window.open(item.link, '_blank');
    }
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
    }
  }
}

