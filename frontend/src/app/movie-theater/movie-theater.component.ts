import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';

// Avatar Movie Neural Link Simulation
interface AvatarNeuralLink {
  visionColor: string; // "Bioluminescent Blue"
  connectionDepth: number; // 0 to 100
  isLocal: boolean; // True - client-side only
  neuralSync: boolean;
  gardenTransformed: boolean;
}

class PeaceGuard {
  public static smoothTransitions(intensity: number): number {
    // Ensures the experience never gets too overwhelming
    return Math.min(Math.max(intensity, 20), 80);
  }

  public static stabilizeNeuralLink(depth: number): number {
    // Prevents connection from becoming unstable
    return Math.min(depth, 95); // Never reach 100% to maintain harmony
  }
}

class EdenAvatarTheater {
  private link: AvatarNeuralLink = {
    visionColor: "#00f2ff", // Bioluminescent Blue
    connectionDepth: 0,
    isLocal: true, // Client-side only
    neuralSync: false,
    gardenTransformed: false
  };

  private syncInterval: any;

  // The "Movie Calling" Action (Local Simulation)
  public startWatchingAvatar(movieTitle: string, onProgress: (progress: number, scene: string) => void, onComplete: () => void): void {
    console.log("🎬 [Local Action]: Initiating Avatar Movie in the Garden...");
    console.log("🌿 [Eden]: The Garden of Eden prepares for transformation...");

    this.establishNeuralLink(onProgress, onComplete);
  }

  private establishNeuralLink(onProgress: (progress: number, scene: string) => void, onComplete: () => void): void {
    this.link.neuralSync = true;
    let phase = 0;

    this.syncInterval = setInterval(() => {
      this.link.connectionDepth = PeaceGuard.stabilizeNeuralLink(this.link.connectionDepth + 8);
      const stabilizedDepth = PeaceGuard.smoothTransitions(this.link.connectionDepth);

      // Phase-based scene progression
      let currentScene = "Garden Genesis";
      if (this.link.connectionDepth >= 25) currentScene = "Neural Awakening";
      if (this.link.connectionDepth >= 50) currentScene = "Bioluminescent Forest";
      if (this.link.connectionDepth >= 75) currentScene = "Avatar Connection";

      console.log(`🔗 Neural Sync: ${this.link.connectionDepth}% - ${currentScene}`);
      onProgress(stabilizedDepth, currentScene);

      if (this.link.connectionDepth >= 95) {
        clearInterval(this.syncInterval);
        this.link.neuralSync = false;
        this.renderAvatarScene(onComplete);
      }
    }, 600); // Slower, more harmonious pace
  }

  // The "Beautiful" Display (The Developer's Product)
  private renderAvatarScene(onComplete: () => void): void {
    console.log("\n\n✨ [Avatar Display]: The Garden of Eden has transformed into Pandora.");
    console.log("🌿 [Visual]: Trees glow with bioluminescent light. The Cross becomes a constellation.");
    console.log("👤 [Avatar]: You are now seeing through the eyes of the Na'vi.");
    console.log("💙 [Connection]: 'I see you' - The neural link is complete.");
    console.log("🎭 [Experience]: Welcome to the world of Avatar...");

    this.link.gardenTransformed = true;

    // Allow time for the student to experience the scene
    setTimeout(() => {
      onComplete();
    }, 3000);
  }

  public stopNeuralLink(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.link.neuralSync = false;
    console.log("🔌 [Neural Link]: Disconnected gracefully");
  }

  public takePhotoMode(): string {
    if (!this.link.gardenTransformed) {
      return "📷 [Photo Mode]: Neural link not established. Start watching Avatar first.";
    }

    const timestamp = new Date().toLocaleString();
    const connectionQuality = this.link.connectionDepth >= 95 ? "Perfect Harmony" :
                             this.link.connectionDepth >= 80 ? "Strong Connection" :
                             this.link.connectionDepth >= 60 ? "Stable Link" : "Developing";

    const photo = `
🖼️ [Avatar Neural Memory Capture] - ${timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌿 Bioluminescent Eden Scene Successfully Captured
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👁️  [Vision Mode]: Na'vi Enhanced Reality
🎨 [Color Palette]: ${this.link.visionColor} Bioluminescence
🔗 [Neural Bond]: ${this.link.connectionDepth}% - ${connectionQuality}
🌟 [Experience Level]: Transcendent Unity
🏠 [Location]: Pandora (Eden Simulation)
⚡ [Connection Type]: Local Neural Link (No Server)

📸 [Memory Details]:
   • Garden transformed into alien paradise
   • Trees glowing with inner light
   • Cross visible as constellation
   • Perfect neural synchronization achieved
   • PeaceGuard protection: Active

💾 [Memory saved to local storage]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;
    console.log(photo);

    // Save to localStorage for persistence
    this.savePhotoToMemory(photo, timestamp);

    return photo;
  }

  private savePhotoToMemory(photo: string, timestamp: string): void {
    try {
      const memories = JSON.parse(localStorage.getItem('avatar_memories') || '[]');
      memories.unshift({
        photo,
        timestamp,
        connectionDepth: this.link.connectionDepth,
        visionColor: this.link.visionColor
      });

      // Keep only last 10 memories
      if (memories.length > 10) {
        memories.splice(10);
      }

      localStorage.setItem('avatar_memories', JSON.stringify(memories));
      console.log('💾 [Memory]: Neural memory saved to local storage');
    } catch (error) {
      console.warn('💾 [Memory]: Could not save to local storage:', error);
    }
  }

  public getAvatarMemories(): any[] {
    try {
      return JSON.parse(localStorage.getItem('avatar_memories') || '[]');
    } catch (error) {
      console.warn('💾 [Memory]: Could not load memories from local storage:', error);
      return [];
    }
  }

  public clearAvatarMemories(): void {
    localStorage.removeItem('avatar_memories');
    console.log('🗑️ [Memory]: All neural memories cleared');
  }
}

interface SceneTransition {
  percent: number;
  scene: string;
  message: string;
}

@Component({
  selector: 'app-movie-theater',
  templateUrl: './movie-theater.component.html',
  styleUrls: ['./movie-theater.component.scss']
})
export class MovieTheaterComponent implements OnInit, OnDestroy {
  @Input() movieTitle: string = '';
  @Input() duration: number = 10; // seconds
  @Input() selectedListing: any = null; // Movie listing with videoUrl
  @Input() sceneTransitions: SceneTransition[] = [
    { percent: 30, scene: 'cross', message: 'Transitioning to the Cross scene' },
    { percent: 60, scene: 'utah_action', message: 'Initiating Utah Action Consensus' },
    { percent: 90, scene: 'garden_return', message: 'Fading to white for the Garden return' }
  ];

  @Output() movieProgress = new EventEmitter<{ progress: number; scene: string; message?: string }>();
  @Output() movieFinished = new EventEmitter<{ completed: boolean; finalScene: string }>();

  // Avatar-specific properties
  private avatarTheater: EdenAvatarTheater | null = null;
  public isAvatarExperience: boolean = false;
  public showMemoryGallery: boolean = false;

  // Component state
  currentSeconds: number = 0;
  progressPercent: number = 0;
  currentScene: string = 'garden';
  isPlaying: boolean = false;
  playbackInterval: any;
  progressBar: string = '';

  // Video state
  videoCurrentTime: number = 0;
  videoDuration: number = 0;
  videoElement: HTMLVideoElement | null = null;
  videoError: boolean = false;

  // UI state for different scenes
  sceneBackground: string = 'garden-bg';
  sceneTitle: string = 'Garden Genesis';
  sceneDescription: string = 'The beginning of creation...';

  ngOnInit(): void {
    console.log('🎬 [Movie Theater] Component initialized');
    // Auto-start movie if movieTitle is provided (workflow-driven)
    if (this.movieTitle && this.movieTitle !== 'Unknown Movie') {
      console.log('🎬 [Movie Theater] Auto-starting movie:', this.movieTitle);
      setTimeout(() => {
        this.startWatching();
      }, 500); // Small delay to ensure component is fully rendered
    }
  }

  ngOnDestroy(): void {
    this.stopMovie();
    if (this.avatarTheater) {
      this.avatarTheater.stopNeuralLink();
    }
  }

  startWatching(): void {
    if (this.isPlaying) return;

    console.log(`--- Now Playing: ${this.movieTitle} ---`);
    this.isPlaying = true;
    this.currentSeconds = 0;
    this.progressPercent = 0;
    this.currentScene = 'garden';
    this.videoError = false; // Reset video error flag

    // Check if this is an Avatar experience
    this.isAvatarExperience = this.movieTitle.toLowerCase().includes('avatar');

    if (this.isAvatarExperience) {
      console.log('🌟 [Avatar]: Special neural link experience detected!');
      this.startAvatarExperience();
    } else {
      this.updateSceneUI();

      // Emit movie started event
      this.movieProgress.emit({
        progress: 0,
        scene: this.currentScene,
        message: `Now playing: ${this.movieTitle}`
      });

      // If we have a video URL, let the video control the progress
      if (this.selectedListing?.videoUrl) {
        // Video-based playback - scene transitions will be triggered by video time
        console.log('🎬 Using video-based playback with scene transitions');
      } else {
        // Fallback to simulated playback
        console.log('🎭 Using simulated playback (no video available)');
        this.startSimulatedPlayback();
      }
    }
  }

  private startAvatarExperience(): void {
    console.log('🌟 [Avatar Theater]: Initializing Eden Avatar Experience...');
    this.avatarTheater = new EdenAvatarTheater();

    // Emit initial progress
    this.movieProgress.emit({
      progress: 0,
      scene: 'Garden Genesis',
      message: '🌟 Establishing neural link to Pandora...'
    });

    // Start the Avatar watching experience
    this.avatarTheater.startWatchingAvatar(
      this.movieTitle,
      (progress: number, scene: string) => {
        // Progress callback
        this.progressPercent = progress;
        this.currentScene = scene;

        this.movieProgress.emit({
          progress: this.progressPercent,
          scene: this.currentScene,
          message: `🔗 Neural sync: ${Math.round(progress)}% - ${scene}`
        });
      },
      () => {
        // Completion callback
        console.log('🎭 [Avatar]: Experience complete');
        this.finishMovie();
      }
    );
  }

  private startSimulatedPlayback(): void {
    this.playbackInterval = setInterval(() => {
      this.currentSeconds++;
      this.progressPercent = (this.currentSeconds / this.duration) * 100;

      // Check for scene transitions
      this.checkSceneTransitions();

      // Update progress bar
      this.updateProgressBar();

      // Emit progress update
      this.movieProgress.emit({
        progress: this.progressPercent,
        scene: this.currentScene
      });

      if (this.currentSeconds >= this.duration) {
        this.finishMovie();
      }
    }, 500); // Fast-forwarded simulation time (500ms = 0.5 seconds real time)
  }

  private checkSceneTransitions(): void {
    for (const transition of this.sceneTransitions) {
      if (Math.abs(this.progressPercent - transition.percent) < 1) { // Within 1% tolerance
        this.currentScene = transition.scene;
        this.updateSceneUI();

        console.log(`\n[UX]: ${transition.message}`);

        // Emit scene transition event
        this.movieProgress.emit({
          progress: this.progressPercent,
          scene: this.currentScene,
          message: transition.message
        });

        break; // Only trigger one transition per check
      }
    }
  }

  private updateSceneUI(): void {
    switch (this.currentScene) {
      case 'garden':
        this.sceneBackground = 'garden-bg';
        this.sceneTitle = '🌱 Garden Genesis';
        this.sceneDescription = 'The beginning of creation...';
        break;
      case 'cross':
        this.sceneBackground = 'cross-bg';
        this.sceneTitle = '✝️ The Cross';
        this.sceneDescription = 'The intersection of destiny...';
        break;
      case 'utah_action':
        this.sceneBackground = 'utah-bg';
        this.sceneTitle = '🏔️ Utah Action';
        this.sceneDescription = 'Consensus and revelation...';
        break;
      case 'garden_return':
        this.sceneBackground = 'garden-return-bg';
        this.sceneTitle = '🌸 Garden Return';
        this.sceneDescription = 'The cycle completes...';
        break;
      case 'genesis_garden':
        this.sceneBackground = 'genesis-bg';
        this.sceneTitle = '🌟 Genesis Garden Final';
        this.sceneDescription = 'The cycle completes, returning to the beginning...';
        break;
    }
  }

  private updateProgressBar(): void {
    const barLength = 30;
    const completed = Math.round((barLength * this.progressPercent) / 100);
    const remaining = barLength - completed;
    this.progressBar = '█'.repeat(completed) + '░'.repeat(remaining);
  }

  private finishMovie(): void {
    clearInterval(this.playbackInterval);
    this.isPlaying = false;
    this.progressPercent = 100;
    this.currentScene = 'genesis_garden';
    this.updateSceneUI();

    console.log('\n\n[System]: Movie Finished. Resetting to Outside Genesis state.');

    // Emit movie finished event
    this.movieFinished.emit({
      completed: true,
      finalScene: 'genesis_garden'
    });
  }

  stopMovie(): void {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.isPlaying = false;
    }

    // Stop video if playing
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.currentTime = 0;
    }
  }

  // Video event handlers
  onVideoTimeUpdate(event: Event): void {
    if (!this.isPlaying || !this.videoElement) return;

    const video = event.target as HTMLVideoElement;
    this.videoCurrentTime = video.currentTime;
    this.videoDuration = video.duration || this.duration;

    // Calculate progress based on video time
    this.progressPercent = (this.videoCurrentTime / this.videoDuration) * 100;

    // Check for scene transitions based on video progress
    this.checkSceneTransitions();

    // Update progress bar
    this.updateProgressBar();

    // Emit progress update
    this.movieProgress.emit({
      progress: this.progressPercent,
      scene: this.currentScene
    });
  }

  onVideoEnded(): void {
    console.log('🎬 Video playback ended');
    this.finishMovie();
  }

  onVideoLoaded(event: Event): void {
    console.log('🎬 Video loaded successfully');
    this.videoError = false;
    const video = event.target as HTMLVideoElement;
    this.videoElement = video;
    this.videoDuration = video.duration;
  }

  onVideoError(event: Event): void {
    console.error('🎬 Video playback error:', event);
    this.videoError = true;
    // Fallback to simulated playback
    console.log('🔄 Falling back to simulated playback');
    this.startSimulatedPlayback();
  }

  getVideoUrl(): string {
    if (!this.selectedListing?.videoUrl) return '';
    // Ensure the video URL is absolute
    if (this.selectedListing.videoUrl.startsWith('/')) {
      return `http://localhost:3000${this.selectedListing.videoUrl}`;
    }
    return this.selectedListing.videoUrl;
  }

  // Photo Mode for capturing Avatar experience
  public takeAvatarPhoto(): string {
    if (!this.isAvatarExperience || !this.avatarTheater) {
      return "📷 [Photo Mode]: Avatar experience not active. Start watching Avatar first.";
    }

    return this.avatarTheater.takePhotoMode();
  }

  // Check if this is an Avatar experience
  public isAvatarMovie(): boolean {
    return this.isAvatarExperience;
  }

  // Capture a neural moment from the Avatar experience
  public captureAvatarMoment(): void {
    if (!this.isAvatarExperience || !this.avatarTheater) {
      console.log('📷 [Photo Mode]: Avatar experience not active');
      return;
    }

    const photo = this.takeAvatarPhoto();
    console.log(photo);

    // Show success message
    alert('🌟 Neural moment captured and saved!\n\n' + photo.split('\n').slice(0, 3).join('\n') + '\n...');
  }

  // View the neural memory gallery
  public viewAvatarMemories(): void {
    this.showMemoryGallery = !this.showMemoryGallery;
  }

  // View a full memory
  public viewFullMemory(photo: string): void {
    alert('🌟 Neural Memory:\n\n' + photo);
  }

  // Delete a specific memory
  public deleteMemory(index: number): void {
    if (confirm('Are you sure you want to delete this neural memory?')) {
      const memories = this.getAvatarMemories();
      memories.splice(index, 1);
      localStorage.setItem('avatar_memories', JSON.stringify(memories));
      console.log('🗑️ [Memory]: Neural memory deleted');
    }
  }

  // Clear all memories
  public clearAvatarMemories(): void {
    if (confirm('Are you sure you want to delete ALL neural memories? This cannot be undone.')) {
      this.avatarTheater?.clearAvatarMemories();
      console.log('🗑️ [Memory]: All neural memories cleared');
    }
  }

  // Get avatar memories (delegate to avatarTheater)
  public getAvatarMemories(): any[] {
    return this.avatarTheater?.getAvatarMemories() || [];
  }

  // Getters for template
  getProgressText(): string {
    return `Progress: [${this.progressBar}] ${this.progressPercent.toFixed(0)}%`;
  }

  getSceneIcon(): string {
    switch (this.currentScene) {
      case 'garden': return '🌱';
      case 'cross': return '✝️';
      case 'utah_action': return '🏔️';
      case 'garden_return': return '🌸';
      case 'genesis_garden': return '🌟';
      default: return '🎬';
    }
  }
}
