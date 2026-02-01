import { Component, OnInit } from '@angular/core';
import { VideoLibraryService, Video } from '../../services/video-library.service';

@Component({
  selector: 'app-video-library',
  templateUrl: './video-library.component.html',
  styleUrls: ['./video-library.component.scss']
})
export class VideoLibraryComponent implements OnInit {
  videos: Video[] = [];
  loading = false;
  syncing = false;
  searchQuery = '';
  selectedVideo: Video | null = null;
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

  constructor(private videoLibraryService: VideoLibraryService) {}

  ngOnInit(): void {
    this.loadVideos();
  }

  loadVideos(): void {
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

  openDetailsModal(video: Video): void {
    this.selectedVideo = video;
    const modalElement = document.getElementById('videoDetailsModal');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement);
      modal.show();
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
        const message = `Sync completed: ${result.added} added, ${result.updated} updated, ${result.removed} removed`;
        if (result.errors.length > 0) {
          alert(`${message}\n\nErrors: ${result.errors.join('\n')}`);
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
    const unanalyzedVideos = this.videos.filter(v => !v.analysis);
    if (unanalyzedVideos.length === 0) {
      alert('All videos are already analyzed!');
      return;
    }

    if (confirm(`Analyze ${unanalyzedVideos.length} unanalyzed videos? This may take several minutes.`)) {
      const videoIds = unanalyzedVideos.map(v => v.id);
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
}

