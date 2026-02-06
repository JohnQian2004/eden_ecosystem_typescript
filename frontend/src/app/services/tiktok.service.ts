import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getMediaServerUrl } from './api-base';

export interface TikTokVideo {
  id: string;
  filename: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  author: string;
  authorDisplayName: string;
  likes: number;
  isLiked: boolean;
  isFollowing: boolean;
  followers: number;
  comments?: number;
  tags: string[];
  duration?: number;
  file_size?: number;
  created_at: string;
}

export interface TikTokFeedResponse {
  success: boolean;
  data: TikTokVideo[];
  count: number;
  total: number;
  hasMore: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TikTokService {
  // Use relative URL to go through Eden backend proxy
  // This avoids mixed content issues (HTTPS page loading HTTP resources)
  // Eden backend proxies /api/media/* requests to the media server
  private baseUrl = '/api/media/tiktok';
  private userId = 'anonymous'; // TODO: Get from auth service

  constructor(private http: HttpClient) {
    console.log(`📱 [TikTokService] Using Eden backend proxy: ${this.baseUrl}`);
    console.log(`📱 [TikTokService] Eden backend will proxy to media server`);
    
    // Get user ID from localStorage or use anonymous
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      this.userId = storedUserId;
    }
  }

  /**
   * Get TikTok feed (random videos)
   */
  getFeed(limit: number = 10, offset: number = 0): Observable<TikTokFeedResponse> {
    const params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString())
      .set('userId', this.userId);

    return this.http.get<TikTokFeedResponse>(`${this.baseUrl}/feed`, { params });
  }

  /**
   * Like/Unlike a video
   */
  likeVideo(videoId: string): Observable<{ success: boolean; data: { videoId: string; isLiked: boolean; likeCount: number } }> {
    return this.http.post<{ success: boolean; data: { videoId: string; isLiked: boolean; likeCount: number } }>(
      `${this.baseUrl}/like/${videoId}`,
      { userId: this.userId }
    );
  }

  /**
   * Follow/Unfollow an author
   */
  followAuthor(authorId: string): Observable<{ success: boolean; data: { authorId: string; isFollowing: boolean; followerCount: number } }> {
    return this.http.post<{ success: boolean; data: { authorId: string; isFollowing: boolean; followerCount: number } }>(
      `${this.baseUrl}/follow/${authorId}`,
      { userId: this.userId }
    );
  }

  /**
   * Get like status for a video
   */
  getLikeStatus(videoId: string): Observable<{ success: boolean; data: { videoId: string; isLiked: boolean; likeCount: number } }> {
    const params = new HttpParams().set('userId', this.userId);
    return this.http.get<{ success: boolean; data: { videoId: string; isLiked: boolean; likeCount: number } }>(
      `${this.baseUrl}/like/${videoId}/status`,
      { params }
    );
  }

  /**
   * Get profile stats for an author
   */
  getProfileStats(authorId: string): Observable<{ success: boolean; data: { authorId: string; videoCount: number; totalLikes: number; followerCount: number } }> {
    return this.http.get<{ success: boolean; data: { authorId: string; videoCount: number; totalLikes: number; followerCount: number } }>(
      `${this.baseUrl}/profile/${encodeURIComponent(authorId)}`
    );
  }
}

