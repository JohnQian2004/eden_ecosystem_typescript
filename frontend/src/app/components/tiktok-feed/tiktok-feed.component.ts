import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { TikTokService, TikTokVideo } from '../../services/tiktok.service';
import { VideoLibraryService } from '../../services/video-library.service';

@Component({
  selector: 'app-tiktok-feed',
  templateUrl: './tiktok-feed.component.html',
  styleUrls: ['./tiktok-feed.component.scss']
})
export class TikTokFeedComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('feedContainer', { static: false }) feedContainer?: ElementRef<HTMLDivElement>;
  
  videos: TikTokVideo[] = [];
  currentIndex = 0;
  loading = false;
  loadingMore = false;
  hasMore = true;
  error: string | null = null;
  
  private scrollTimeout: any;
  private isScrolling = false;
  private touchStartY = 0;
  private touchEndY = 0;
  private readonly SCROLL_THRESHOLD = 50; // Minimum scroll distance to change video

  private handleEscapeKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.closeFeed();
    }
  }

  constructor(
    private tiktokService: TikTokService,
    private videoLibraryService: VideoLibraryService
  ) {
    // Listen for escape key to close
    document.addEventListener('keydown', this.handleEscapeKey);
  }

  ngOnInit(): void {
    this.loadFeed();
    // Auto-play first video after a short delay
    setTimeout(() => {
      if (this.videos.length > 0 && this.currentIndex === 0) {
        this.scrollToVideo(0);
      }
    }, 500);
  }

  onVideoLoaded(event: Event, index: number): void {
    const video = event.target as HTMLVideoElement;
    if (video) {
      // Ensure video is muted for autoplay
      video.muted = true;
      // Play if this is the current video
      if (index === this.currentIndex) {
        video.play().catch(err => {
          console.warn('Video autoplay failed:', err);
        });
      } else {
        // Pause other videos
        video.pause();
      }
    }
  }

  ngAfterViewInit(): void {
    // Focus on container for keyboard navigation
    if (this.feedContainer) {
      this.feedContainer.nativeElement.focus();
    }
  }

  ngOnDestroy(): void {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    document.removeEventListener('keydown', this.handleEscapeKey);
  }

  closeFeed(): void {
    // Emit event or use service to notify parent
    // For now, we'll use a simple approach - parent component will handle visibility
    const event = new CustomEvent('tiktok-close');
    window.dispatchEvent(event);
  }

  loadFeed(): void {
    if (this.loading) return;
    
    this.loading = true;
    this.error = null;

    this.tiktokService.getFeed(20, 0).subscribe({
      next: (response) => {
        this.videos = response.data;
        this.hasMore = response.hasMore;
        this.currentIndex = 0;
        this.loading = false;
        
        // Load like statuses for all videos
        this.loadLikeStatuses();
      },
      error: (error) => {
        console.error('Error loading TikTok feed:', error);
        this.error = 'Failed to load videos. Please try again.';
        this.loading = false;
      }
    });
  }

  loadMoreVideos(): void {
    if (this.loadingMore || !this.hasMore) return;

    this.loadingMore = true;
    this.tiktokService.getFeed(10, this.videos.length).subscribe({
      next: (response) => {
        this.videos = [...this.videos, ...response.data];
        this.hasMore = response.hasMore;
        this.loadingMore = false;
        this.loadLikeStatuses();
      },
      error: (error) => {
        console.error('Error loading more videos:', error);
        this.loadingMore = false;
      }
    });
  }

  loadLikeStatuses(): void {
    // Load like status for videos that don't have it yet
    this.videos.forEach((video, index) => {
      if (video.likes === 0 && !video.isLiked) {
        this.tiktokService.getLikeStatus(video.id).subscribe({
          next: (response) => {
            if (response.success) {
              this.videos[index].isLiked = response.data.isLiked;
              this.videos[index].likes = response.data.likeCount;
            }
          },
          error: (error) => {
            console.error('Error loading like status:', error);
          }
        });
      }
    });
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    event.preventDefault();
    
    if (this.isScrolling) return;

    const delta = event.deltaY;
    if (Math.abs(delta) < this.SCROLL_THRESHOLD) return;

    this.isScrolling = true;
    
    if (delta > 0 && this.currentIndex < this.videos.length - 1) {
      // Scroll down - next video
      this.currentIndex++;
      this.scrollToVideo(this.currentIndex);
    } else if (delta < 0 && this.currentIndex > 0) {
      // Scroll up - previous video
      this.currentIndex--;
      this.scrollToVideo(this.currentIndex);
    }

    // Load more videos if near the end
    if (this.currentIndex >= this.videos.length - 3 && this.hasMore) {
      this.loadMoreVideos();
    }

    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      this.isScrolling = false;
    }, 300);
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    this.touchStartY = event.touches[0].clientY;
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    this.touchEndY = event.changedTouches[0].clientY;
    const delta = this.touchStartY - this.touchEndY;

    if (Math.abs(delta) < this.SCROLL_THRESHOLD) return;

    if (delta > 0 && this.currentIndex < this.videos.length - 1) {
      // Swipe up - next video
      this.currentIndex++;
      this.scrollToVideo(this.currentIndex);
    } else if (delta < 0 && this.currentIndex > 0) {
      // Swipe down - previous video
      this.currentIndex--;
      this.scrollToVideo(this.currentIndex);
    }

    // Load more videos if near the end
    if (this.currentIndex >= this.videos.length - 3 && this.hasMore) {
      this.loadMoreVideos();
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' && this.currentIndex < this.videos.length - 1) {
      event.preventDefault();
      this.currentIndex++;
      this.scrollToVideo(this.currentIndex);
    } else if (event.key === 'ArrowUp' && this.currentIndex > 0) {
      event.preventDefault();
      this.currentIndex--;
      this.scrollToVideo(this.currentIndex);
    }
  }

  scrollToVideo(index: number): void {
    if (!this.feedContainer) return;

    const videoElement = this.feedContainer.nativeElement.querySelector(`[data-video-index="${index}"]`) as HTMLElement;
    if (videoElement) {
      videoElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Play the current video and pause others
      setTimeout(() => {
        const allVideos = this.feedContainer!.nativeElement.querySelectorAll('video') as NodeListOf<HTMLVideoElement>;
        allVideos.forEach((video, i) => {
          if (i === index) {
            video.muted = true; // Ensure muted for autoplay
            video.play().catch(err => {
              console.warn(`Video ${i} autoplay failed:`, err);
            });
          } else {
            video.pause();
          }
        });
      }, 100);
    }
  }

  likeVideo(video: TikTokVideo): void {
    this.tiktokService.likeVideo(video.id).subscribe({
      next: (response) => {
        if (response.success) {
          video.isLiked = response.data.isLiked;
          video.likes = response.data.likeCount;
        }
      },
      error: (error) => {
        console.error('Error liking video:', error);
      }
    });
  }

  followAuthor(video: TikTokVideo): void {
    this.tiktokService.followAuthor(video.author).subscribe({
      next: (response) => {
        if (response.success) {
          video.isFollowing = response.data.isFollowing;
          video.followers = response.data.followerCount;
        }
      },
      error: (error) => {
        console.error('Error following author:', error);
      }
    });
  }

  getVideoStreamUrl(video: TikTokVideo): string {
    return this.videoLibraryService.getVideoStreamUrl(video.filename, video.id, video.videoUrl);
  }

  formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  openComments(video: TikTokVideo): void {
    // TODO: Implement comments modal/section
    alert(`Comments for "${video.title}" - Coming soon!`);
  }

  shareVideo(video: TikTokVideo): void {
    // Share functionality
    const videoUrl = this.getVideoStreamUrl(video);
    if (navigator.share) {
      navigator.share({
        title: video.title,
        text: `Check out this video: ${video.title}`,
        url: videoUrl
      }).catch(err => {
        console.log('Error sharing:', err);
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(videoUrl).then(() => {
        alert('Video URL copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy URL:', err);
        alert(`Video URL: ${videoUrl}`);
      });
    }
  }
}

