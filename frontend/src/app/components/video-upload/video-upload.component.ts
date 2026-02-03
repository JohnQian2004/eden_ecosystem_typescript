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
  selectedFiles: File[] = [];
  uploadProgress: { [key: string]: { progress: number; status: 'pending' | 'uploading' | 'success' | 'error' | 'duplicate'; message?: string } } = {};
  
  // Video metadata fields
  videoTags: string = '';
  videoDetails: string = '';
  showMetadataForm: boolean = true; // Show by default

  constructor(private videoLibraryService: VideoLibraryService) {}

  onFileSelected(event: Event): void {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📁 [VideoUpload] ========== FILES SELECTED ==========');
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFiles = Array.from(input.files);
      this.selectedFile = this.selectedFiles[0]; // Keep for backward compatibility
      
      // Initialize upload progress for all files
      this.uploadProgress = {};
      this.selectedFiles.forEach(file => {
        this.uploadProgress[file.name] = { progress: 0, status: 'pending' };
      });
      
      console.log('📁 [VideoUpload] Files selected:', this.selectedFiles.length);
      this.selectedFiles.forEach((file, index) => {
        console.log(`📁 [VideoUpload]   File ${index + 1}:`, file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      });
      console.log('📁 [VideoUpload] ✅ Files ready for bulk upload');
    } else {
      console.warn('📁 [VideoUpload] No files selected');
      this.selectedFiles = [];
      this.selectedFile = null;
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  uploadVideo(): void {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 [VideoUpload] ========== BULK UPLOAD VIDEO REQUEST ==========');
    console.log('📤 [VideoUpload] uploadVideo() method called');
    console.log('📤 [VideoUpload] Files to upload:', this.selectedFiles.length);
    
    if (this.selectedFiles.length === 0) {
      console.error('📤 [VideoUpload] ❌ No files selected');
      alert('Please select video files');
      return;
    }

    // Validate all files
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
    const allowedExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const maxSize = 500 * 1024 * 1024; // 500MB
    
    const validFiles: File[] = [];
    const invalidFiles: { file: File; reason: string }[] = [];
    
    this.selectedFiles.forEach(file => {
      const fileName = file.name.toLowerCase();
      const hasValidExt = allowedExts.some(ext => fileName.endsWith(ext));
      
      if (!allowedTypes.includes(file.type) && !hasValidExt) {
        invalidFiles.push({ file, reason: 'Invalid file type' });
        return;
      }
      
      if (file.size > maxSize) {
        invalidFiles.push({ file, reason: 'File exceeds 500MB limit' });
        return;
      }
      
      validFiles.push(file);
    });
    
    if (invalidFiles.length > 0) {
      const invalidList = invalidFiles.map(f => `• ${f.file.name}: ${f.reason}`).join('\n');
      alert(`Some files are invalid:\n\n${invalidList}\n\nOnly valid files will be uploaded.`);
    }
    
    if (validFiles.length === 0) {
      alert('No valid video files to upload');
      return;
    }

    console.log('📤 [VideoUpload] ✅ File validation passed:', validFiles.length, 'valid files');
    this.uploading = true;

    // Upload files sequentially to avoid overwhelming the server
    this.uploadFilesSequentially(validFiles, 0);
  }

  private uploadFilesSequentially(files: File[], index: number): void {
    if (index >= files.length) {
      // All files uploaded
      const successCount = Object.values(this.uploadProgress).filter(p => p.status === 'success').length;
      const duplicateCount = Object.values(this.uploadProgress).filter(p => p.status === 'duplicate').length;
      const errorCount = Object.values(this.uploadProgress).filter(p => p.status === 'error').length;
      
      this.uploading = false;
      this.selectedFiles = [];
      this.selectedFile = null;
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
      
      let message = `Upload complete!\n\n✅ Success: ${successCount}`;
      if (duplicateCount > 0) message += `\n⚠️ Duplicates: ${duplicateCount}`;
      if (errorCount > 0) message += `\n❌ Errors: ${errorCount}`;
      alert(message);
      
      this.uploaded.emit();
      this.uploadProgress = {};
      return;
    }

    const file = files[index];
    const fileName = file.name;
    
    console.log(`📤 [VideoUpload] Uploading file ${index + 1}/${files.length}: ${fileName}`);
    this.uploadProgress[fileName] = { progress: 0, status: 'uploading' };
    
    const uploadStartTime = Date.now();
    
    // Use hardcoded tags and details if not provided
    const tags = this.videoTags.trim() || 'video,media,upload';
    const details = this.videoDetails.trim() || 'Uploaded video file';
    
    this.videoLibraryService.uploadVideo(file, tags, details).subscribe({
      next: (response) => {
        const uploadDuration = Date.now() - uploadStartTime;
        console.log(`📤 [VideoUpload] ✅ Upload response for ${fileName}:`, uploadDuration, 'ms');
        
        if (response.status === 'success') {
          this.uploadProgress[fileName] = { progress: 100, status: 'success', message: 'Uploaded successfully' };
          console.log(`📤 [VideoUpload] ✅ ${fileName} uploaded successfully`);
        } else if (response.status === 'duplicate') {
          this.uploadProgress[fileName] = { progress: 100, status: 'duplicate', message: response.message || 'Duplicate detected' };
          console.log(`📤 [VideoUpload] ⚠️ ${fileName} is a duplicate`);
        } else {
          this.uploadProgress[fileName] = { progress: 100, status: 'error', message: response.message || 'Upload failed' };
          console.error(`📤 [VideoUpload] ❌ ${fileName} upload failed:`, response.message);
        }
        
        // Continue with next file
        setTimeout(() => this.uploadFilesSequentially(files, index + 1), 100);
      },
      error: (error) => {
        const errorMessage = error.error?.message || error.message || 'Upload failed';
        this.uploadProgress[fileName] = { progress: 100, status: 'error', message: errorMessage };
        console.error(`📤 [VideoUpload] ❌ ${fileName} upload error:`, errorMessage);
        
        // Continue with next file even on error
        setTimeout(() => this.uploadFilesSequentially(files, index + 1), 100);
      },
    });
  }
  
  getUploadStatus(fileName: string): string {
    const progress = this.uploadProgress[fileName];
    if (!progress) return '';
    
    switch (progress.status) {
      case 'success': return '✅';
      case 'duplicate': return '⚠️';
      case 'error': return '❌';
      case 'uploading': return '⏳';
      default: return '';
    }
  }
  
  getUploadMessage(fileName: string): string {
    return this.uploadProgress[fileName]?.message || '';
  }
  
  hasUploadProgress(): boolean {
    return Object.keys(this.uploadProgress).length > 0;
  }
}

