import { Component, EventEmitter, Output } from '@angular/core';
import { VideoLibraryService } from '../../services/video-library.service';

@Component({
  selector: 'app-video-upload',
  templateUrl: './video-upload.component.html',
  styleUrls: ['./video-upload.component.scss']
})
export class VideoUploadComponent {
  @Output() uploaded = new EventEmitter<void>();
  uploading = false;
  selectedFile: File | null = null;

  constructor(private videoLibraryService: VideoLibraryService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  uploadVideo(): void {
    if (!this.selectedFile) {
      alert('Please select a video file');
      return;
    }

    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    const allowedExts = ['.mp4', '.mov', '.avi', '.mkv'];
    const fileName = this.selectedFile.name.toLowerCase();
    const hasValidExt = allowedExts.some(ext => fileName.endsWith(ext));
    
    if (!allowedTypes.includes(this.selectedFile.type) && !hasValidExt) {
      alert('Invalid file type. Only MP4, MOV, AVI, MKV are allowed.');
      return;
    }

    const maxSize = 500 * 1024 * 1024;
    if (this.selectedFile.size > maxSize) {
      alert('File size exceeds 500MB limit');
      return;
    }

    this.uploading = true;

    this.videoLibraryService.uploadVideo(this.selectedFile).subscribe({
      next: (response) => {
        if (response.status === 'success') {
          alert('Video uploaded successfully');
          this.uploading = false;
          this.selectedFile = null;
          const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (fileInput) {
            fileInput.value = '';
          }
          this.uploaded.emit();
        } else {
          alert(response.message || 'Upload failed');
          this.uploading = false;
        }
      },
      error: (error) => {
        console.error('Error uploading video:', error);
        const errorMessage = error.error?.message || error.message || 'Failed to upload video';
        alert(`Error: ${errorMessage}`);
        this.uploading = false;
      },
    });
  }
}

