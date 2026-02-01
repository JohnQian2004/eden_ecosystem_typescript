import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Video {
  id: string;
  filename: string;
  file_path: string;
  duration?: number;
  resolution_width?: number;
  resolution_height?: number;
  frame_rate?: number;
  file_size?: number;
  codec?: string;
  created_at: string;
  updated_at: string;
  analysis?: VideoAnalysis;
  tags: string[];
  analyzed_at?: string;
  is_new?: boolean;
}

export interface VideoAnalysis {
  content_tags: string[];
  shot_type?: string;
  camera_movement?: string;
  camera_angle?: string;
  lighting_brightness?: string;
  lighting_temperature?: string;
  time_of_day?: string;
  detected_objects: string[];
  scene_type?: string;
  ocr_text?: string;
  main_subject?: string | { description: string; [key: string]: any };
  activity?: string | { description: string; [key: string]: any };
  environment?: string | { description: string; [key: string]: any };
  mood?: string | { description: string; [key: string]: any };
  analysis_metadata?: Record<string, any>;
  analyzed_at?: string;
}

export interface ApiResponse<T> {
  status: string;
  data?: T;
  message?: string;
  count?: number;
}

@Injectable({
  providedIn: 'root',
})
export class VideoLibraryService {
  private apiUrl = '/api/v1/library'; // Video library API endpoints
  private videosApiUrl = '/api/videos'; // Simple videos endpoint (currently available)

  constructor(private http: HttpClient) {}

  /**
   * Get all videos with optional filters
   */
  getVideos(filters?: {
    tags?: string[];
    shot_type?: string;
    scene_type?: string;
    search?: string;
  }): Observable<ApiResponse<Video[]>> {
    let params = new HttpParams();

    if (filters) {
      if (filters.tags && filters.tags.length > 0) {
        params = params.set('tags', filters.tags.join(','));
      }
      if (filters.shot_type) {
        params = params.set('shot_type', filters.shot_type);
      }
      if (filters.scene_type) {
        params = params.set('scene_type', filters.scene_type);
      }
      if (filters.search) {
        params = params.set('search', filters.search);
      }
    }

    // Use the existing /api/videos endpoint which reads from library.json
    return this.http.get<any>(this.videosApiUrl, { params }).pipe(
      map((response) => {
        // Backend returns: { success: true, data: videos[], count: number }
        // Handle both the new format (response.data) and legacy formats
        const videosArray = response.data || response.videos || (Array.isArray(response) ? response : []);
        
        // Transform the response to match our Video interface
        const videos: Video[] = videosArray.map((v: any) => ({
          id: v.id || v.filename,
          filename: v.filename,
          file_path: v.file_path || `videos/${v.filename}`,
          duration: v.duration,
          resolution_width: v.resolution_width,
          resolution_height: v.resolution_height,
          frame_rate: v.frame_rate,
          file_size: v.file_size,
          codec: v.codec,
          created_at: v.created_at || new Date().toISOString(),
          updated_at: v.updated_at || new Date().toISOString(),
          analysis: v.analysis,
          tags: v.tags || [],
          analyzed_at: v.analyzed_at,
          is_new: v.is_new
        }));
        return { status: 'success', data: videos };
      })
    );
  }

  /**
   * Get video by ID
   */
  getVideo(id: string): Observable<ApiResponse<Video>> {
    return this.http.get<ApiResponse<Video>>(
      `${this.apiUrl}/videos/${id}`
    );
  }

  /**
   * Get video stream URL
   * @param filenameOrPath - Video filename or file_path from library.json
   */
  getVideoStreamUrl(filenameOrPath: string): string {
    // Backend serves videos from /api/movie/video/{path}
    // The backend expects the path relative to the data directory
    // file_path in library.json is like "videos\filename.mp4" or "videos/filename.mp4"
    // Normalize path separators and use as-is (backend will join with data directory)
    const normalizedPath = filenameOrPath.replace(/\\/g, '/');
    return `/api/movie/video/${normalizedPath}`;
  }

  /**
   * Upload video
   */
  uploadVideo(file: File): Observable<ApiResponse<Video>> {
    const formData = new FormData();
    formData.append('video', file);

    return this.http.post<ApiResponse<Video>>(
      `${this.apiUrl}/videos/upload`,
      formData
    );
  }

  /**
   * Delete video
   */
  deleteVideo(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(
      `${this.apiUrl}/videos/${id}`
    );
  }

  /**
   * Remove audio from video
   */
  removeAudio(id: string): Observable<ApiResponse<Video>> {
    return this.http.post<ApiResponse<Video>>(
      `${this.apiUrl}/videos/${id}/remove-audio`,
      {}
    );
  }

  /**
   * Add tags to video
   */
  addTags(id: string, tags: string[]): Observable<ApiResponse<Video>> {
    return this.http.post<ApiResponse<Video>>(
      `${this.apiUrl}/videos/${id}/tags`,
      { tags }
    );
  }

  /**
   * Get all tags
   */
  getTags(): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(`${this.apiUrl}/tags`);
  }

  /**
   * Sync videos from data/videos directory
   */
  syncVideos(): Observable<{
    added: number;
    updated: number;
    removed: number;
    errors: string[];
  }> {
    return this.http.post<{
      status: string;
      data: {
        added: number;
        updated: number;
        removed: number;
        errors: string[];
      };
      message: string;
    }>(`${this.apiUrl}/videos/sync`, {}).pipe(
      map((response) => response.data)
    );
  }

  /**
   * Analyze a video
   */
  analyzeVideo(id: string): Observable<ApiResponse<Video>> {
    return this.http.post<ApiResponse<Video>>(
      `${this.apiUrl}/videos/${id}/analyze`,
      {}
    );
  }

  /**
   * Analyze multiple videos
   */
  analyzeVideosBatch(videoIds: string[]): Observable<ApiResponse<any[]>> {
    return this.http.post<ApiResponse<any[]>>(
      `${this.apiUrl}/videos/analyze-batch`,
      { video_ids: videoIds }
    );
  }
}

