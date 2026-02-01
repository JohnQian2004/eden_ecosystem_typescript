/**
 * Video Library Service for React Native
 * Handles video library API calls
 */

import { getApiBaseUrl } from './api-base';

export interface Video {
  id: string;
  filename: string;
  title?: string;
  file_path?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  size?: number;
  analysis?: any;
}

class VideoLibraryService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = `${getApiBaseUrl()}/api`;
  }

  async getVideos(): Promise<Video[]> {
    try {
      const response = await fetch(`${this.apiUrl}/videos`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Handle both response formats
      const videos = data.data || data.videos || (Array.isArray(data) ? data : []);
      return videos.map((video: any) => ({
        ...video,
        videoUrl: this.getVideoStreamUrl(video.filename || video.file_path || ''),
      }));
    } catch (error) {
      console.error('Error fetching videos:', error);
      throw error;
    }
  }

  getVideoStreamUrl(filename: string): string {
    // Extract just the filename if file_path contains path
    const cleanFilename = filename.replace(/^.*[\\\/]/, '').replace(/^videos[\\\/]/, '');
    return `${this.apiUrl}/movie/video/${cleanFilename}`;
  }

  async analyzeVideo(videoId: string): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/videos/${videoId}/analyze`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error analyzing video:', error);
      throw error;
    }
  }
}

export default new VideoLibraryService();

