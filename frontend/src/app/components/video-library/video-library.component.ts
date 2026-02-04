import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, HostListener, OnDestroy } from '@angular/core';
import { VideoLibraryService, Video } from '../../services/video-library.service';

@Component({
  selector: 'app-video-library',
  templateUrl: './video-library.component.html',
  styleUrls: ['./video-library.component.scss']
})
export class VideoLibraryComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('videoPlayerElement', { static: false }) videoPlayerElement?: ElementRef<HTMLVideoElement>;
  
  videos: Video[] = [];
  loading = false;
  syncing = false;
  searchQuery = '';
  selectedVideo: Video | null = null;
  selectedVideoForPlayer: Video | null = null;
  showVideoPlayer = false;
  showDetailsInPlayer = false;
  librarySize = 0; // Total size in bytes
  librarySizeFormatted = '0 MB';
  selectedFilters: {
    shot_type?: string;
    scene_type?: string;
    tags?: string[];
    content_tags?: string[];
  } = {};
  allContentTags: string[] = [];
  filteredVideos: Video[] = [];
  showTikTokMode = false;
  videosLoaded = false; // Track if videos have been loaded

  constructor(
    private videoLibraryService: VideoLibraryService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Don't load videos automatically - wait until tab is selected
    // Listen for TikTok close event
    window.addEventListener('tiktok-close', this.disableTikTokMode.bind(this));
  }

  /**
   * Load videos when tab is selected (called from parent or when component becomes visible)
   */
  loadVideosIfNeeded(): void {
    if (!this.videosLoaded && !this.loading) {
      this.loadVideos();
    }
  }

  ngAfterViewInit(): void {
    // No longer needed for slide-out player
  }

  loadVideos(): void {
    if (this.loading) return; // Prevent duplicate loads
    
    this.loading = true;
    // Don't send content_tags to backend - it's filtered on frontend
    const { content_tags, ...backendFilters } = this.selectedFilters;
    const filters = {
      ...backendFilters,
      search: this.searchQuery || undefined,
    };

    this.videoLibraryService.getVideos(filters).subscribe({
      next: (response) => {
        this.videos = response.data || [];
        this.collectContentTags();
        this.applyContentTagFilter();
        this.calculateLibrarySize();
        this.loading = false;
        this.videosLoaded = true; // Mark as loaded
      },
      error: (error) => {
        console.error('Error loading videos:', error);
        alert('Failed to load videos');
        this.loading = false;
      },
    });
  }

  onSearch(): void {
    this.loadVideos();
  }

  onVideoDeleted(): void {
    this.loadVideos();
  }

  onVideoUploaded(): void {
    this.loadVideos();
  }

  onPlayVideo(video: Video): void {
    this.openVideoPlayer(video);
  }

  openDetailsModal(video: Video): void {
    console.log('📋 [VideoLibrary] Opening details modal for video:', video.filename);
    this.selectedVideo = video;
    this.cdr.detectChanges(); // Ensure Angular updates the view
    
    setTimeout(() => {
      const modalElement = document.getElementById('videoDetailsModal');
      if (modalElement) {
        console.log('📋 [VideoLibrary] Modal element found, setting z-index...');
        // Set high z-index to appear above video player (z-index: 99999)
        modalElement.style.zIndex = '100000';
        modalElement.style.display = 'block';
        
        const modal = new (window as any).bootstrap.Modal(modalElement, {
          backdrop: true,
          keyboard: true
        });
        
        // After modal is shown, ensure backdrop also has high z-index
        modalElement.addEventListener('shown.bs.modal', () => {
          console.log('📋 [VideoLibrary] Modal shown event fired');
          const backdrop = document.querySelector('.modal-backdrop');
          if (backdrop) {
            (backdrop as HTMLElement).style.zIndex = '99999';
            console.log('📋 [VideoLibrary] Backdrop z-index set to 99999');
          }
          // Also ensure modal itself is above backdrop
          modalElement.style.zIndex = '100000';
          modalElement.classList.add('show');
          console.log('📋 [VideoLibrary] Modal z-index set to 100000, should be visible now');
        }, { once: true });
        
        console.log('📋 [VideoLibrary] Showing modal...');
        modal.show();
      } else {
        console.error('📋 [VideoLibrary] Modal element not found!');
      }
    }, 100);
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent): void {
    if (this.showVideoPlayer && this.selectedVideoForPlayer) {
      this.closeVideoPlayer();
    }
  }

  @HostListener('document:fullscreenchange', ['$event'])
  @HostListener('document:webkitfullscreenchange', ['$event'])
  @HostListener('document:mozfullscreenchange', ['$event'])
  @HostListener('document:MSFullscreenChange', ['$event'])
  handleFullscreenChange(): void {
    // If fullscreen is exited by browser controls, close the player
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement && 
        !(document as any).mozFullScreenElement && !(document as any).msFullscreenElement) {
      if (this.showVideoPlayer) {
        this.closeVideoPlayer();
      }
    }
  }

  openVideoPlayer(video: Video): void {
    this.selectedVideoForPlayer = video;
    this.showVideoPlayer = true;
    // Prevent body scroll when player is open
    document.body.style.overflow = 'hidden';
    this.cdr.detectChanges();
    
    // Enter fullscreen mode
    setTimeout(() => {
      const container = document.querySelector('.video-player-container');
      if (container) {
        if (container.requestFullscreen) {
          container.requestFullscreen().catch(err => {
            console.log('Error attempting to enable fullscreen:', err);
          });
        } else if ((container as any).webkitRequestFullscreen) {
          (container as any).webkitRequestFullscreen();
        } else if ((container as any).mozRequestFullScreen) {
          (container as any).mozRequestFullScreen();
        } else if ((container as any).msRequestFullscreen) {
          (container as any).msRequestFullscreen();
        }
      }
    }, 100);
    
    // Auto-play video after a short delay to ensure DOM is ready
    setTimeout(() => {
      this.playVideo();
    }, 300);
  }

  closeVideoPlayer(): void {
    // Exit fullscreen mode if active
    if (document.fullscreenElement || (document as any).webkitFullscreenElement || 
        (document as any).mozFullScreenElement || (document as any).msFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => {
          console.log('Error attempting to exit fullscreen:', err);
        });
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
    
    this.pauseVideo();
    this.showVideoPlayer = false;
    this.selectedVideoForPlayer = null;
    this.showDetailsInPlayer = false;
    // Restore body scroll
    document.body.style.overflow = '';
  }

  toggleDetailsInPlayer(): void {
    this.showDetailsInPlayer = !this.showDetailsInPlayer;
    this.cdr.detectChanges();
  }

  enableTikTokMode(): void {
    this.showTikTokMode = true;
    // Prevent body scroll when TikTok mode is active
    document.body.style.overflow = 'hidden';
  }

  disableTikTokMode(): void {
    this.showTikTokMode = false;
    // Restore body scroll
    document.body.style.overflow = '';
    // Notify parent component
    const event = new CustomEvent('tiktok-mode-disabled');
    window.dispatchEvent(event);
  }

  ngOnDestroy(): void {
    // Clean up: restore body scroll if component is destroyed while player is open
    if (this.showVideoPlayer) {
      document.body.style.overflow = '';
    }
    if (this.showTikTokMode) {
      document.body.style.overflow = '';
    }
    window.removeEventListener('tiktok-close', this.disableTikTokMode.bind(this));
  }

  playVideo(): void {
    const video = this.videoPlayerElement?.nativeElement;
    if (video && this.selectedVideoForPlayer) {
      video.load();
      video.play().catch((error) => {
        // Autoplay might be blocked, but controls will allow manual play
        console.log('Autoplay blocked, user can play manually');
      });
    }
  }

  pauseVideo(): void {
    const video = this.videoPlayerElement?.nativeElement;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }

  closeDetailsModal(): void {
    const modalElement = document.getElementById('videoDetailsModal');
    if (modalElement) {
      const modal = (window as any).bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
      }
    }
    this.selectedVideo = null;
  }

  syncVideos(): void {
    this.syncing = true;
    this.videoLibraryService.syncVideos().subscribe({
      next: (result) => {
        this.syncing = false;
        let message = `Sync completed:\n• ${result.added} added\n• ${result.updated} updated\n• ${result.removed} removed`;
        if (result.analyzed && result.analyzed > 0) {
          message += `\n• ${result.analyzed} analyzed automatically`;
        }
        if (result.errors.length > 0) {
          alert(`${message}\n\nErrors:\n${result.errors.join('\n')}`);
        } else {
          alert(message);
        }
        // Reload videos after sync
        this.loadVideos();
      },
      error: (error) => {
        this.syncing = false;
        console.error('Error syncing videos:', error);
        alert('Error syncing videos. Please try again.');
      },
    });
  }

  analyzeAllVideos(): void {
    if (this.videos.length === 0) {
      alert('No videos to analyze!');
      return;
    }

    const analyzedCount = this.videos.filter(v => v.analysis).length;
    const unanalyzedCount = this.videos.length - analyzedCount;
    
    let message = `Re-analyze ALL ${this.videos.length} videos?`;
    if (unanalyzedCount > 0) {
      message += `\n\n${unanalyzedCount} videos are not yet analyzed.\n${analyzedCount} videos will be re-analyzed.`;
    } else {
      message += `\n\nAll videos will be re-analyzed.`;
    }
    message += `\n\nThis may take several minutes.`;

    if (confirm(message)) {
      const videoIds = this.videos.map(v => v.id);
      this.videoLibraryService.analyzeVideosBatch(videoIds).subscribe({
        next: (response) => {
          const successCount = response.data?.filter((r: any) => r.status === 'success').length || 0;
          alert(`Analysis completed: ${successCount} of ${videoIds.length} videos analyzed successfully`);
          this.loadVideos();
        },
        error: (error) => {
          console.error('Error analyzing videos:', error);
          alert('Error analyzing videos. Please try again.');
        },
      });
    }
  }

  collectContentTags(): void {
    const tagSet = new Set<string>();
    this.videos.forEach(video => {
      if (video.analysis?.content_tags) {
        video.analysis.content_tags.forEach(tag => tagSet.add(tag));
      }
    });
    this.allContentTags = Array.from(tagSet).sort();
  }

  applyContentTagFilter(): void {
    if (!this.selectedFilters.content_tags || this.selectedFilters.content_tags.length === 0) {
      this.filteredVideos = this.videos;
      return;
    }

    this.filteredVideos = this.videos.filter(video => {
      if (!video.analysis?.content_tags) return false;
      // Show video if it has at least one of the selected content tags
      return this.selectedFilters.content_tags!.some(tag => 
        video.analysis!.content_tags.includes(tag)
      );
    });
  }

  toggleContentTag(tag: string): void {
    if (!this.selectedFilters.content_tags) {
      this.selectedFilters.content_tags = [];
    }
    
    const index = this.selectedFilters.content_tags.indexOf(tag);
    if (index > -1) {
      // Remove tag if already selected
      this.selectedFilters.content_tags.splice(index, 1);
    } else {
      // Add tag if not selected
      this.selectedFilters.content_tags.push(tag);
    }
    
    this.applyContentTagFilter();
    this.calculateLibrarySize();
  }

  isContentTagSelected(tag: string): boolean {
    return this.selectedFilters.content_tags?.includes(tag) || false;
  }

  onFilterChange(): void {
    // Always reload from backend for shot_type/scene_type filters
    // Content tag filter will be applied after videos are loaded
    this.loadVideos();
  }

  calculateLibrarySize(): void {
    const videosToCalculate = this.filteredVideos.length > 0 ? this.filteredVideos : this.videos;
    this.librarySize = videosToCalculate.reduce((total, video) => {
      return total + (video.file_size || 0);
    }, 0);
    
    // Format library size
    const mb = this.librarySize / (1024 * 1024);
    const gb = mb / 1024;
    if (gb >= 1) {
      this.librarySizeFormatted = `${gb.toFixed(2)} GB`;
    } else {
      this.librarySizeFormatted = `${mb.toFixed(2)} MB`;
    }
  }

  getVideoPlayerUrl(video: Video): string {
    const videoId = video.id;
    const videoUrl = (video as any).videoUrl; // videoUrl from API response
    return this.videoLibraryService.getVideoStreamUrl(video.filename, videoId, videoUrl);
  }
}

