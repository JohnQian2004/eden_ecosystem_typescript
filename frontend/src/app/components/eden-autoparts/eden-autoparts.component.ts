import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getApiBaseUrl } from '../../services/api-base';

export interface AutoPart {
  title: string;
  price: string;
  image: string;
  link: string;
  merchant?: string;
  vendor?: string;
}

export interface SearchResponse {
  search_string: string;
  max_return: number;
  results_count: number;
  results: AutoPart[];
}

@Component({
  selector: 'app-eden-autoparts',
  templateUrl: './eden-autoparts.component.html',
  styleUrls: ['./eden-autoparts.component.scss']
})
export class EdenAutopartsComponent implements OnInit {
  searchQuery: string = '';
  searchResults: AutoPart[] = [];
  isLoading: boolean = false;
  hasSearched: boolean = false;
  errorMessage: string = '';
  private apiUrl = getApiBaseUrl();
  // Use main server API which proxies to autoparts service (for HTTPS compatibility)
  private autopartsServiceUrl = `${this.apiUrl}/api/autoparts`;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    // Component initialized
  }

  async performSearch(): Promise<void> {
    if (!this.searchQuery.trim()) {
      return;
    }

    this.isLoading = true;
    this.hasSearched = true;
    this.errorMessage = '';
    this.searchResults = [];

    try {
      // Search via the AutoParts service (proxied through main server)
      const response = await this.http.get<SearchResponse>(
        `${this.autopartsServiceUrl}/search`,
        {
          params: {
            search_string: this.searchQuery.trim(),
            maxReturn: '30'
          }
        }
      ).toPromise();

      if (response && response.results) {
        this.searchResults = response.results;
        console.log(`🔧 [AutoParts] Found ${this.searchResults.length} results for "${this.searchQuery}"`);
      }
    } catch (error: any) {
      console.error('🔧 [AutoParts] Search error:', error);
      this.errorMessage = error.message || 'Failed to search auto parts. Please try again.';
      this.searchResults = [];
    } finally {
      this.isLoading = false;
    }
  }

  onSearchKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.performSearch();
    }
  }

  openProductLink(link: string): void {
    if (link) {
      window.open(link, '_blank');
    }
  }

  getImageUrl(image: string): string {
    if (!image) {
      return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
    }
    return image;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
    }
  }
}

