import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { Video, VideoLibraryService } from '../../services/video-library.service';

@Component({
  selector: 'app-video-details',
  templateUrl: './video-details.component.html',
  styleUrls: ['./video-details.component.scss']
})
export class VideoDetailsComponent implements OnInit {
  @Input() video!: Video;
  @Input() hideVideoPlayer = false; // Hide video player when used inside player overlay
  @Output() close = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>(); // Emit when video is deleted
  videoStreamUrl: string = '';
  analyzing: boolean = false;
  deleting: boolean = false;

  constructor(private videoLibraryService: VideoLibraryService) {}

  ngOnInit(): void {
    if (this.video) {
      // Backend /api/movie/video/ endpoint expects just the filename
      // The backend will automatically look in data/videos/ directory
      // So we use filename directly, not file_path
      const videoPath = this.video.filename;
      this.videoStreamUrl = this.videoLibraryService.getVideoStreamUrl(videoPath);
    }
  }

  closeModal(): void {
    this.close.emit();
    // Only try to close modal if we're in a modal context
    const modalElement = document.querySelector('.modal.show');
    if (modalElement) {
      const modal = (window as any).bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
      }
    }
    // If not in modal, the parent component will handle closing via the close event
  }

  removeAudio(): void {
    if (confirm('Remove audio from this video? This cannot be undone.')) {
      this.videoLibraryService.removeAudio(this.video.id).subscribe({
        next: (response) => {
          this.video = response.data!;
          alert('Audio removed successfully');
        },
        error: (error) => {
          console.error('Error removing audio:', error);
          alert('Failed to remove audio');
        },
      });
    }
  }

  removeFromLibrary(): void {
    if (!confirm(`Remove "${this.video.filename}" from the video library?\n\nThis will remove it from the library but will NOT delete the video file from disk.`)) {
      return;
    }

    this.deleting = true;
    this.videoLibraryService.deleteVideo(this.video.id).subscribe({
      next: () => {
        this.deleting = false;
        alert('Video removed from library successfully');
        this.deleted.emit(); // Notify parent component
        this.closeModal(); // Close the modal
      },
      error: (error) => {
        this.deleting = false;
        console.error('Error removing video from library:', error);
        const errorMsg = error.error?.message || 'Failed to remove video from library';
        alert(`Error: ${errorMsg}`);
      },
    });
  }

  analyzeVideo(): void {
    if (this.analyzing) return;
    
    this.analyzing = true;
    this.videoLibraryService.analyzeVideo(this.video.id).subscribe({
      next: (response) => {
        this.video = response.data!;
        this.analyzing = false;
        alert('Video analyzed successfully!');
      },
      error: (error) => {
        console.error('Error analyzing video:', error);
        this.analyzing = false;
        const errorMsg = error.error?.message || 'Failed to analyze video';
        alert(`Error: ${errorMsg}`);
      },
    });
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }

  getContentDescription(field: string | { description: string; [key: string]: any } | undefined): string {
    if (!field) return '';
    if (typeof field === 'string') {
      return field;
    }
    if (typeof field === 'object' && field !== null) {
      return field.description || '';
    }
    return '';
  }

  getFullContentDescriptionText(): string {
    if (!this.video.analysis) return '';
    
    const parts: string[] = [];
    
    if (this.video.analysis.main_subject) {
      parts.push(`Main Subject:\n\n${this.getContentDescription(this.video.analysis.main_subject)}`);
    }
    
    if (this.video.analysis.activity) {
      parts.push(`Activity:\n\n${this.getContentDescription(this.video.analysis.activity)}`);
    }
    
    if (this.video.analysis.environment) {
      parts.push(`Environment:\n\n${this.getContentDescription(this.video.analysis.environment)}`);
    }
    
    if (this.video.analysis.mood) {
      parts.push(`Mood:\n\n${this.getContentDescription(this.video.analysis.mood)}`);
    }
    
    return parts.join('\n\n');
  }

  copyContentDescription(): void {
    const text = this.getFullContentDescriptionText();
    if (!text) {
      alert('No content description available to copy');
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showCopySuccess();
      }).catch((err) => {
        console.error('Failed to copy text: ', err);
        this.fallbackCopyTextToClipboard(text);
      });
    } else {
      this.fallbackCopyTextToClipboard(text);
    }
  }

  private fallbackCopyTextToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.showCopySuccess();
      } else {
        alert('Failed to copy text. Please select and copy manually.');
      }
    } catch (err) {
      console.error('Fallback copy failed: ', err);
      alert('Failed to copy text. Please select and copy manually.');
    }
    
    document.body.removeChild(textArea);
  }

  private showCopySuccess(): void {
    const toast = document.createElement('div');
    toast.className = 'copy-success-toast';
    toast.textContent = 'Copied to clipboard!';
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  }
}

