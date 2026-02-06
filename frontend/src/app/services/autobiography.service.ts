/**
 * Autobiography Service
 * Handles API calls for autobiography generator
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getApiBaseUrl } from './api-base';

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  created_utc: number;
  score: number;
  num_comments: number;
  permalink: string;
  url: string;
  subreddit: string;
  category?: 'autobiography' | 'white_paper' | 'unsorted';
  order?: number;
}

export interface AutobiographyPost {
  id: string;
  title: string;
  content: string;
  author: string;
  created_utc: number;
  category: 'autobiography' | 'white_paper';
  order: number;
  originalRedditId?: string;
  originalRedditUrl?: string;
  translatedContent?: {
    chinese?: string;
    english?: string;
  };
  lastModified?: string;
  version?: string;
}

export interface AutobiographyData {
  version: string;
  lastUpdated: string;
  posts: AutobiographyPost[];
}

@Injectable({
  providedIn: 'root'
})
export class AutobiographyService {
  private apiBase = getApiBaseUrl();

  constructor(private http: HttpClient) {}

  /**
   * Fetch posts from Reddit
   */
  fetchRedditPosts(limit: number = 100): Observable<{ success: boolean; posts: RedditPost[]; count: number }> {
    return this.http.get<any>(`${this.apiBase}/api/autobiography/reddit/posts?limit=${limit}`);
  }

  /**
   * Load autobiography posts
   */
  loadAutobiography(): Observable<{ success: boolean; data: AutobiographyData }> {
    return this.http.get<any>(`${this.apiBase}/api/autobiography/autobiography`);
  }

  /**
   * Load white paper posts
   */
  loadWhitePaper(): Observable<{ success: boolean; data: AutobiographyData }> {
    return this.http.get<any>(`${this.apiBase}/api/autobiography/white-paper`);
  }

  /**
   * Save autobiography posts
   */
  saveAutobiography(posts: AutobiographyPost[]): Observable<{ success: boolean; message: string }> {
    return this.http.post<any>(`${this.apiBase}/api/autobiography/autobiography`, { posts });
  }

  /**
   * Save white paper posts
   */
  saveWhitePaper(posts: AutobiographyPost[]): Observable<{ success: boolean; message: string }> {
    return this.http.post<any>(`${this.apiBase}/api/autobiography/white-paper`, { posts });
  }

  /**
   * Translate content
   */
  translateContent(content: string, targetLanguage: 'chinese' | 'english'): Observable<{ success: boolean; translated: string; targetLanguage: string }> {
    return this.http.post<any>(`${this.apiBase}/api/autobiography/translate`, {
      content,
      targetLanguage
    });
  }

  /**
   * Create new Reddit post
   */
  createRedditPost(title: string, content: string, subreddit?: string): Observable<{ success: boolean; postId?: string; error?: string }> {
    return this.http.post<any>(`${this.apiBase}/api/autobiography/reddit/create`, {
      title,
      content,
      subreddit
    });
  }
}

