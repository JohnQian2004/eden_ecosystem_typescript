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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📁 [VideoUpload] ========== FILE SELECTED ==========');
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      console.log('📁 [VideoUpload] File selected:');
      console.log('📁 [VideoUpload]   Name:', this.selectedFile.name);
      console.log('📁 [VideoUpload]   Size:', this.selectedFile.size, 'bytes', `(${(this.selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
      console.log('📁 [VideoUpload]   Type:', this.selectedFile.type);
      console.log('📁 [VideoUpload]   Last modified:', new Date(this.selectedFile.lastModified).toISOString());
      console.log('📁 [VideoUpload] ✅ selectedFile property set, upload button should now be visible');
      console.log('📁 [VideoUpload] Click the green "Upload" button to start upload');
    } else {
      console.warn('📁 [VideoUpload] No file selected');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  uploadVideo(): void {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 [VideoUpload] ========== UPLOAD VIDEO REQUEST ==========');
    console.log('📤 [VideoUpload] uploadVideo() method called');
    console.log('📤 [VideoUpload] selectedFile:', this.selectedFile ? this.selectedFile.name : 'null');
    console.log('📤 [VideoUpload] uploading state:', this.uploading);
    
    if (!this.selectedFile) {
      console.error('📤 [VideoUpload] ❌ No file selected');
      alert('Please select a video file');
      return;
    }

    console.log('📤 [VideoUpload] Validating file...');
    console.log('📤 [VideoUpload]   File name:', this.selectedFile.name);
    console.log('📤 [VideoUpload]   File size:', this.selectedFile.size, 'bytes');
    console.log('📤 [VideoUpload]   File type:', this.selectedFile.type);

    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    const allowedExts = ['.mp4', '.mov', '.avi', '.mkv'];
    const fileName = this.selectedFile.name.toLowerCase();
    const hasValidExt = allowedExts.some(ext => fileName.endsWith(ext));
    
    console.log('📤 [VideoUpload]   File extension check:', fileName);
    console.log('📤 [VideoUpload]   Has valid extension:', hasValidExt);
    console.log('📤 [VideoUpload]   MIME type in allowed list:', allowedTypes.includes(this.selectedFile.type));
    
    if (!allowedTypes.includes(this.selectedFile.type) && !hasValidExt) {
      console.error('📤 [VideoUpload] ❌ Invalid file type');
      alert('Invalid file type. Only MP4, MOV, AVI, MKV are allowed.');
      return;
    }

    const maxSize = 500 * 1024 * 1024;
    if (this.selectedFile.size > maxSize) {
      console.error('📤 [VideoUpload] ❌ File too large:', this.selectedFile.size, 'bytes');
      alert('File size exceeds 500MB limit');
      return;
    }

    console.log('📤 [VideoUpload] ✅ File validation passed');
    console.log('📤 [VideoUpload] Setting uploading state to true...');
    this.uploading = true;

    console.log('📤 [VideoUpload] Calling videoLibraryService.uploadVideo()...');
    const uploadStartTime = Date.now();
    
    this.videoLibraryService.uploadVideo(this.selectedFile).subscribe({
      next: (response) => {
        const uploadDuration = Date.now() - uploadStartTime;
        console.log('📤 [VideoUpload] ✅ Upload response received:', uploadDuration, 'ms');
        console.log('📤 [VideoUpload]   Response status:', response.status);
        console.log('📤 [VideoUpload]   Response data:', response.data);
        console.log('📤 [VideoUpload]   Response message:', response.message);
        
        if (response.status === 'success') {
          console.log('📤 [VideoUpload] ✅✅✅ UPLOAD SUCCESSFUL ✅✅✅');
          alert('Video uploaded successfully');
          this.uploading = false;
          this.selectedFile = null;
          const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (fileInput) {
            fileInput.value = '';
          }
          console.log('📤 [VideoUpload] Emitting uploaded event...');
          this.uploaded.emit();
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } else {
          console.error('📤 [VideoUpload] ❌ Upload failed:', response.message);
          alert(response.message || 'Upload failed');
          this.uploading = false;
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
      },
      error: (error) => {
        const uploadDuration = Date.now() - uploadStartTime;
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('📤 [VideoUpload] ❌❌❌ UPLOAD ERROR ❌❌❌');
        console.error('📤 [VideoUpload]   Duration before error:', uploadDuration, 'ms');
        console.error('📤 [VideoUpload]   Error object:', error);
        console.error('📤 [VideoUpload]   Error status:', error.status);
        console.error('📤 [VideoUpload]   Error status text:', error.statusText);
        console.error('📤 [VideoUpload]   Error message:', error.message);
        console.error('📤 [VideoUpload]   Error error:', error.error);
        console.error('📤 [VideoUpload]   Error URL:', error.url);
        console.error('📤 [VideoUpload]   Full error:', JSON.stringify(error, null, 2));
        
        const errorMessage = error.error?.message || error.message || 'Failed to upload video';
        console.error('📤 [VideoUpload]   User-friendly error message:', errorMessage);
        alert(`Error: ${errorMessage}`);
        this.uploading = false;
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      },
    });
    
    console.log('📤 [VideoUpload] Upload request initiated, waiting for response...');
  }
}

