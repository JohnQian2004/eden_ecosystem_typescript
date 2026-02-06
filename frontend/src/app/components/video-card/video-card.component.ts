import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { Video, VideoLibraryService } from '../../services/video-library.service';

@Component({
  selector: 'app-video-card',
  templateUrl: './video-card.component.html',
  styleUrls: ['./video-card.component.scss']
})
export class VideoCardComponent implements OnInit, OnDestroy {
  @Input() video!: Video;
  @Output() deleted = new EventEmitter<void>();
  @Output() details = new EventEmitter<Video>();
  @Output() playVideo = new EventEmitter<Video>();
  @ViewChild('videoElement', { static: false }) videoElement?: ElementRef<HTMLVideoElement>;
  
  showVideo = false;
  isPlaying = false;
  videoStreamUrl = '';
  snapshotUrl: string | null = null; // Snapshot image URL (if available)
  hoverTimeout?: any;

  constructor(private videoLibraryService: VideoLibraryService) {}

  videoLoadError = false;

  ngOnInit(): void {
    // Use thumbnailUrl for display (backend provides .jpeg if available, otherwise .mp4)
    // If thumbnailUrl is a snapshot (.jpeg), use <img> tag
    // If thumbnailUrl is video (.mp4), use <video> tag
    const thumbnailUrl = this.video.thumbnailUrl || this.video.videoUrl;
    
    if (thumbnailUrl && (thumbnailUrl.endsWith('.jpeg') || thumbnailUrl.endsWith('.png') || thumbnailUrl.includes('/snapshot/'))) {
      // It's a snapshot image, use <img> tag
      this.snapshotUrl = this.videoLibraryService.getVideoStreamUrl('', '', thumbnailUrl);
      this.showVideo = false;
    } else {
      // It's a video, use <video> tag for thumbnail
      const videoPath = this.video.filename;
      this.videoStreamUrl = this.videoLibraryService.getVideoStreamUrl(videoPath);
      this.showVideo = true;
    }
  }

  ngOnDestroy(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
    this.pauseVideo();
  }

  openDetails(): void {
    this.details.emit(this.video);
  }

  deleteVideo(): void {
    if (confirm(`Are you sure you want to delete ${this.video.filename}?`)) {
      this.videoLibraryService.deleteVideo(this.video.id).subscribe({
        next: () => {
          alert('Video deleted successfully');
          this.deleted.emit();
        },
        error: (error) => {
          console.error('Error deleting video:', error);
          alert('Failed to delete video');
        },
      });
    }
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }

  formatDuration(seconds?: number): string {
    if (!seconds) return 'Unknown';
    return `${seconds.toFixed(1)}s`;
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  togglePlay(): void {
    console.log('🎬 [VideoCard] togglePlay() called');
    console.log('🎬 [VideoCard] Video:', this.video);
    console.log('🎬 [VideoCard] Video filename:', this.video?.filename);
    console.log('🎬 [VideoCard] playVideo emitter exists:', !!this.playVideo);
    console.log('🎬 [VideoCard] Emitting playVideo event...');
    try {
      this.playVideo.emit(this.video);
      console.log('🎬 [VideoCard] playVideo event emitted successfully');
    } catch (error) {
      console.error('🎬 [VideoCard] Error emitting playVideo event:', error);
    }
  }

  playVideoInline(): void {
    const video = this.videoElement?.nativeElement;
    if (video) {
      video.play().then(() => {
        this.isPlaying = true;
      }).catch((error) => {
        console.error('Error playing video:', error);
      });
    }
  }

  pauseVideo(): void {
    const video = this.videoElement?.nativeElement;
    if (video) {
      video.pause();
      this.isPlaying = false;
    }
  }

  onVideoLoaded(): void {
    // Don't auto-play - videos should only play when user explicitly requests it
    // The video is loaded but paused, showing the first frame as a thumbnail
    const video = this.videoElement?.nativeElement;
    if (video) {
      // Seek to first frame to show thumbnail
      video.currentTime = 0;
      // Ensure video is paused
      video.pause();
    }
  }

  onSnapshotError(event: any): void {
    // If snapshot fails to load, fallback to video
    console.warn('Snapshot failed to load, falling back to video:', this.video.filename);
    this.snapshotUrl = null;
    const videoPath = this.video.filename;
    this.videoStreamUrl = this.videoLibraryService.getVideoStreamUrl(videoPath);
    this.showVideo = true;
  }

  onVideoError(event: any): void {
    const video = event.target as HTMLVideoElement;
    const error = video.error;
    
    // Log detailed error information for debugging
    console.error('Video load error:', {
      filename: this.video?.filename,
      videoUrl: this.videoStreamUrl,
      src: video.src,
      currentSrc: video.currentSrc,
      error: error ? {
        code: error.code,
        message: error.message
      } : null,
      networkState: video.networkState,
      readyState: video.readyState
    });
    
    // Provide user-friendly error messages based on error code
    if (error) {
      const MEDIA_ERR_ABORTED = 1;
      const MEDIA_ERR_NETWORK = 2;
      const MEDIA_ERR_DECODE = 3;
      const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
      
      switch (error.code) {
        case MEDIA_ERR_ABORTED:
          console.warn('Video loading was aborted');
          break;
        case MEDIA_ERR_NETWORK:
          console.error('Network error - video may be blocked by CORS or network issue');
          break;
        case MEDIA_ERR_DECODE:
          console.error('Video decode error - file may be corrupted');
          break;
        case MEDIA_ERR_SRC_NOT_SUPPORTED:
          console.error('Video source not supported or file not found');
          break;
        default:
          console.error('Unknown video error');
      }
    }
    
    this.videoLoadError = true;
    this.showVideo = false;
    // Don't retry - the file doesn't exist
  }
}

