import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getApiBaseUrl } from '../../services/api-base';

interface TEDTalk {
  id: string;
  title: string;
  description: string;
  speaker: string;
  duration: string;
  videoUrl: string;
  thumbnailUrl: string;
  publishedDate: string;
  views?: number;
  tags?: string[];
}

@Component({
  selector: 'app-eden-ted',
  templateUrl: './eden-ted.component.html',
  styleUrls: ['./eden-ted.component.scss']
})
export class EdenTEDComponent implements OnInit, OnDestroy {
  talks: TEDTalk[] = [];
  isLoading: boolean = false;
  isRefreshing: boolean = false;
  searchQuery: string = '';
  selectedTalk: TEDTalk | null = null;
  showVideoPlayer: boolean = false;
  @ViewChild('videoPlayerElement') videoPlayerElement?: ElementRef<HTMLVideoElement>;
  private refreshInterval: any;
  private apiUrl = getApiBaseUrl();

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadTalks();
    // Auto-refresh every 10 minutes
    this.refreshInterval = setInterval(() => {
      this.refreshTalks();
    }, 10 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadTalks(): Promise<void> {
    this.isLoading = true;
    try {
      const response = await this.http.get<{success: boolean, talks: TEDTalk[]}>(`${this.apiUrl}/api/ted/talks`).toPromise();
      if (response && response.success && response.talks) {
        this.talks = response.talks;
        console.log('🎤 [TED] Loaded talks:', this.talks.length);
      }
    } catch (error) {
      console.error('🎤 [TED] Error loading talks:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async refreshTalks(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    try {
      const response = await this.http.post<{success: boolean, talks: TEDTalk[]}>(`${this.apiUrl}/api/ted/refresh`, {}).toPromise();
      if (response && response.success && response.talks) {
        this.talks = response.talks;
        console.log('🎤 [TED] Refreshed talks:', this.talks.length);
      }
    } catch (error) {
      console.error('🎤 [TED] Error refreshing talks:', error);
    } finally {
      this.isRefreshing = false;
      this.cdr.detectChanges();
    }
  }

  getFilteredTalks(): TEDTalk[] {
    if (!this.searchQuery.trim()) {
      return this.talks;
    }
    
    const query = this.searchQuery.toLowerCase();
    return this.talks.filter(talk => 
      talk.title.toLowerCase().includes(query) ||
      talk.description.toLowerCase().includes(query) ||
      talk.speaker.toLowerCase().includes(query) ||
      (talk.tags && talk.tags.some(tag => tag.toLowerCase().includes(query)))
    );
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  }

  playTalk(talk: TEDTalk, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedTalk = talk;
    this.showVideoPlayer = true;
    // Only prevent body scroll on desktop, allow mobile native scrolling
    if (window.innerWidth > 768) {
      document.body.style.overflow = 'hidden';
    }
    this.cdr.detectChanges();

    // Enter fullscreen mode
    setTimeout(() => {
      const container = this.videoPlayerElement?.nativeElement?.parentElement?.parentElement; // .video-player-container
      if (container) {
        if (container.requestFullscreen) {
          container.requestFullscreen().catch((err) => {
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
    }, 100); // Short delay to ensure DOM is ready

    // Auto-play video after a short delay to ensure DOM is ready
    setTimeout(() => {
      this.playVideo();
    }, 300);
  }

  playVideo(): void {
    if (this.videoPlayerElement?.nativeElement) {
      this.videoPlayerElement.nativeElement.play().catch((err) => {
        console.error('Error playing video:', err);
      });
    }
  }

  pauseVideo(): void {
    if (this.videoPlayerElement?.nativeElement) {
      this.videoPlayerElement.nativeElement.pause();
    }
  }

  closePlayer(): void {
    this.pauseVideo();
    this.showVideoPlayer = false;
    this.selectedTalk = null;
    // Restore body scroll
    document.body.style.overflow = '';
    document.body.style.position = '';

    // Exit fullscreen mode
    if (document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  @HostListener('document:mozfullscreenchange')
  @HostListener('document:MSFullscreenChange')
  onFullscreenChange(): void {
    if (this.showVideoPlayer && !document.fullscreenElement && !(document as any).webkitFullscreenElement && !(document as any).mozFullScreenElement && !(document as any).msFullscreenElement) {
      // If fullscreen was exited by user (e.g., F11 or ESC), close the player
      console.log('Fullscreen exited by user, closing TED player.');
      this.closePlayer();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.showVideoPlayer) {
      this.closePlayer();
    }
  }

  onThumbnailHover(event: Event, isHovering: boolean): void {
    const video = event.target as HTMLVideoElement;
    if (video) {
      if (isHovering) {
        video.play().catch(() => {
          // Autoplay might be blocked, that's okay
        });
      } else {
        video.pause();
        video.currentTime = 0;
      }
    }
  }
}

