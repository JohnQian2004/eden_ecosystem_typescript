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
  @ViewChild('videoElement', { static: false }) videoElement?: ElementRef<HTMLVideoElement>;
  
  showVideo = false;
  isPlaying = false;
  videoStreamUrl = '';
  hoverTimeout?: any;

  constructor(private videoLibraryService: VideoLibraryService) {}

  ngOnInit(): void {
    // Backend /api/movie/video/ endpoint expects just the filename
    // The backend will automatically look in data/videos/ directory
    // So we use filename directly, not file_path
    const videoPath = this.video.filename;
    this.videoStreamUrl = this.videoLibraryService.getVideoStreamUrl(videoPath);
    this.showVideo = true;
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
    if (this.isPlaying) {
      this.pauseVideo();
    } else {
      this.showVideo = true;
      setTimeout(() => {
        this.playVideo();
      }, 100);
    }
  }

  playVideo(): void {
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
    setTimeout(() => {
      this.playVideo();
    }, 200);
  }
}

