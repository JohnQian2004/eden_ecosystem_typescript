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
  activeTab: 'home' | 'friends' | 'upload' | 'inbox' | 'profile' = 'home';
  userEmail: string = '';
  userInitials: string = '';
  userDisplayName: string = '';
  showUploadModal: boolean = false;
  userVideos: TikTokVideo[] = [];
  loadingUserVideos: boolean = false;
  profileStats = {
    videoCount: 0,
    totalLikes: 0,
    followerCount: 0
  };
  
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
    this.loadUserInfo();
    this.loadFeed();
    // Auto-play first video after a short delay
    setTimeout(() => {
      if (this.videos.length > 0 && this.currentIndex === 0) {
        this.scrollToVideo(0);
      }
    }, 500);
  }

  loadUserInfo(): void {
    // Get user email from localStorage
    const savedEmail = localStorage.getItem('userEmail') || '';
    this.userEmail = savedEmail;
    
    if (savedEmail) {
      // Extract display name from email (part before @)
      const emailParts = savedEmail.split('@');
      const username = emailParts[0];
      this.userDisplayName = username.length > 10 ? username.substring(0, 10) + '...' : username;
      
      // Generate initials from email
      const nameParts = username.split(/[._-]/);
      if (nameParts.length >= 2) {
        this.userInitials = (nameParts[0][0] + nameParts[1][0]).toUpperCase();
      } else {
        this.userInitials = username.substring(0, 2).toUpperCase();
      }
    } else {
      this.userDisplayName = 'Guest';
      this.userInitials = 'GU';
    }
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

  formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  // Navigation methods for bottom bar
  navigateToHome(): void {
    this.activeTab = 'home';
    // Home is the default TikTok feed mode - already active
  }

  navigateToFriends(): void {
    this.activeTab = 'friends';
    // TODO: Implement friends feed
    alert('Friends feed - Coming soon!');
  }

  navigateToUpload(): void {
    this.activeTab = 'upload';
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
    this.activeTab = 'home'; // Return to home after closing
  }

  onVideoUploaded(): void {
    // Refresh the feed after upload
    this.loadFeed();
    // If on profile tab, reload user videos and stats
    if (this.activeTab === 'profile') {
      this.loadUserVideos();
      this.loadProfileStats();
    }
    this.closeUploadModal();
  }

  navigateToInbox(): void {
    this.activeTab = 'inbox';
    // Navigate to GOD's inbox
    const event = new CustomEvent('tiktok-navigate', { detail: { tab: 'god-inbox' } });
    window.dispatchEvent(event);
  }

  navigateToProfile(): void {
    this.activeTab = 'profile';
    this.loadUserVideos();
    this.loadProfileStats();
  }

  loadUserVideos(): void {
    if (!this.userEmail) {
      console.warn('No user email available for profile');
      this.userVideos = [];
      return;
    }

    if (this.loadingUserVideos) return;

    this.loadingUserVideos = true;
    
    // Load all videos and filter by user email
    this.videoLibraryService.getVideos().subscribe({
      next: (response) => {
        const allVideos = response.data || [];
        
        // Filter videos by user email (check if author contains user email)
        this.userVideos = allVideos
          .filter((video: any) => {
            const author = video.author || '';
            // Check if author field contains the user's email
            return author.toLowerCase().includes(this.userEmail.toLowerCase());
          })
          .map((video: any) => {
            // Convert Video to TikTokVideo format
            return {
              id: video.id || video.filename,
              filename: video.filename,
              title: video.filename.replace(/\.(mp4|mov|avi|mkv|webm)$/i, ''),
              videoUrl: video.videoUrl || `/api/media/video/${video.filename}`,
              thumbnailUrl: video.thumbnailUrl || video.videoUrl,
              author: video.author || this.userEmail,
              authorDisplayName: this.userDisplayName,
              likes: 0,
              isLiked: false,
              isFollowing: false,
              followers: 0,
              comments: 0,
              tags: video.tags || [],
              duration: video.duration,
              file_size: video.file_size,
              created_at: video.created_at
            } as TikTokVideo;
          });
        
        this.loadingUserVideos = false;
      },
      error: (error) => {
        console.error('Error loading user videos:', error);
        this.userVideos = [];
        this.loadingUserVideos = false;
      }
    });
  }

  loadProfileStats(): void {
    if (!this.userEmail) {
      this.profileStats = { videoCount: 0, totalLikes: 0, followerCount: 0 };
      return;
    }

    this.tiktokService.getProfileStats(this.userEmail).subscribe({
      next: (response) => {
        if (response.success) {
          this.profileStats = {
            videoCount: response.data.videoCount,
            totalLikes: response.data.totalLikes,
            followerCount: response.data.followerCount
          };
        }
      },
      error: (error) => {
        console.error('Error loading profile stats:', error);
        // Set video count from userVideos length as fallback
        this.profileStats = {
          videoCount: this.userVideos.length,
          totalLikes: 0,
          followerCount: 0
        };
      }
    });
  }

  playVideoFromProfile(video: TikTokVideo): void {
    // Switch to home tab and find/play this video
    this.activeTab = 'home';
    const videoIndex = this.videos.findIndex(v => v.id === video.id);
    if (videoIndex >= 0) {
      this.currentIndex = videoIndex;
      this.scrollToVideo(videoIndex);
    } else {
      // Video not in current feed, reload feed and then play
      this.loadFeed();
      setTimeout(() => {
        const index = this.videos.findIndex(v => v.id === video.id);
        if (index >= 0) {
          this.currentIndex = index;
          this.scrollToVideo(index);
        }
      }, 1000);
    }
  }
}

