/**
 * Autobiography Generator Component
 * Manages autobiography and white paper content from Reddit
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { AutobiographyService, RedditPost, AutobiographyPost, AutobiographyData } from '../../services/autobiography.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-autobiography-generator',
  templateUrl: './autobiography-generator.component.html',
  styleUrls: ['./autobiography-generator.component.scss']
})
export class AutobiographyGeneratorComponent implements OnInit, OnDestroy {
  // Reddit posts
  redditPosts: RedditPost[] = [];
  loadingReddit = false;
  
  // Autobiography and White Paper data
  autobiographyData: AutobiographyData = { version: '2.6', lastUpdated: '', posts: [] };
  whitePaperData: AutobiographyData = { version: '2.6', lastUpdated: '', posts: [] };
  loadingAutobiography = false;
  loadingWhitePaper = false;
  saving = false;
  
  // UI state
  activeTab: 'reddit' | 'autobiography' | 'white_paper' = 'reddit';
  selectedPost: RedditPost | AutobiographyPost | null = null;
  editingPost: AutobiographyPost | null = null;
  translating = false;
  translationResult: string | null = null;
  
  // New post creation
  newPostTitle = '';
  newPostContent = '';
  newPostSubreddit = 'GardenOfEdenBillDrape';
  creatingPost = false;

  constructor(private autobiographyService: AutobiographyService) {}

  ngOnInit(): void {
    this.loadRedditPosts();
    this.loadAutobiography();
    this.loadWhitePaper();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  /**
   * Load posts from Reddit
   */
  loadRedditPosts(): void {
    this.loadingReddit = true;
    this.autobiographyService.fetchRedditPosts(100).subscribe({
      next: (response) => {
        if (response.success) {
          this.redditPosts = response.posts || [];
          console.log(`✅ Loaded ${this.redditPosts.length} Reddit posts`);
          if (this.redditPosts.length === 0) {
            console.warn('⚠️ Reddit API returned success but no posts. The subreddit may be empty or private.');
          }
        } else {
          console.error('❌ Reddit API returned success=false:', response);
          this.redditPosts = [];
        }
        this.loadingReddit = false;
      },
      error: (error) => {
        console.error('❌ Error loading Reddit posts:', error);
        console.error('❌ Error details:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          url: error.url
        });
        this.redditPosts = [];
        this.loadingReddit = false;
      }
    });
  }

  /**
   * Load autobiography posts
   */
  loadAutobiography(): void {
    this.loadingAutobiography = true;
    this.autobiographyService.loadAutobiography().subscribe({
      next: (response) => {
        if (response.success) {
          this.autobiographyData = response.data;
          console.log(`✅ Loaded ${this.autobiographyData.posts.length} autobiography posts`);
        }
        this.loadingAutobiography = false;
      },
      error: (error) => {
        console.error('Error loading autobiography:', error);
        this.loadingAutobiography = false;
      }
    });
  }

  /**
   * Load white paper posts
   */
  loadWhitePaper(): void {
    this.loadingWhitePaper = true;
    this.autobiographyService.loadWhitePaper().subscribe({
      next: (response) => {
        if (response.success) {
          this.whitePaperData = response.data;
          console.log(`✅ Loaded ${this.whitePaperData.posts.length} white paper posts`);
        }
        this.loadingWhitePaper = false;
      },
      error: (error) => {
        console.error('Error loading white paper:', error);
        this.loadingWhitePaper = false;
      }
    });
  }

  /**
   * Move post from Reddit to Autobiography
   */
  moveToAutobiography(post: RedditPost): void {
    const autobiographyPost: AutobiographyPost = {
      id: post.id,
      title: post.title,
      content: post.selftext || '',
      author: post.author,
      created_utc: post.created_utc,
      category: 'autobiography',
      order: this.autobiographyData.posts.length,
      originalRedditId: post.id,
      originalRedditUrl: post.permalink
    };
    
    this.autobiographyData.posts.push(autobiographyPost);
    this.saveAutobiography();
  }

  /**
   * Move post from Reddit to White Paper
   */
  moveToWhitePaper(post: RedditPost): void {
    const whitePaperPost: AutobiographyPost = {
      id: post.id,
      title: post.title,
      content: post.selftext || '',
      author: post.author,
      created_utc: post.created_utc,
      category: 'white_paper',
      order: this.whitePaperData.posts.length,
      originalRedditId: post.id,
      originalRedditUrl: post.permalink
    };
    
    this.whitePaperData.posts.push(whitePaperPost);
    this.saveWhitePaper();
  }

  /**
   * Handle drag and drop reordering
   */
  dropAutobiography(event: CdkDragDrop<AutobiographyPost[]>): void {
    moveItemInArray(this.autobiographyData.posts, event.previousIndex, event.currentIndex);
    // Update order numbers
    this.autobiographyData.posts.forEach((post, index) => {
      post.order = index;
    });
    this.saveAutobiography();
  }

  dropWhitePaper(event: CdkDragDrop<AutobiographyPost[]>): void {
    moveItemInArray(this.whitePaperData.posts, event.previousIndex, event.currentIndex);
    // Update order numbers
    this.whitePaperData.posts.forEach((post, index) => {
      post.order = index;
    });
    this.saveWhitePaper();
  }

  /**
   * Save autobiography posts
   */
  saveAutobiography(): void {
    this.saving = true;
    this.autobiographyService.saveAutobiography(this.autobiographyData.posts).subscribe({
      next: (response) => {
        if (response.success) {
          console.log('✅ Autobiography saved successfully');
          this.loadAutobiography(); // Reload to get enhanced content
        }
        this.saving = false;
      },
      error: (error) => {
        console.error('Error saving autobiography:', error);
        this.saving = false;
      }
    });
  }

  /**
   * Save white paper posts
   */
  saveWhitePaper(): void {
    this.saving = true;
    this.autobiographyService.saveWhitePaper(this.whitePaperData.posts).subscribe({
      next: (response) => {
        if (response.success) {
          console.log('✅ White paper saved successfully');
          this.loadWhitePaper(); // Reload to get enhanced content
        }
        this.saving = false;
      },
      error: (error) => {
        console.error('Error saving white paper:', error);
        this.saving = false;
      }
    });
  }

  /**
   * Translate content
   */
  translatePost(post: AutobiographyPost, targetLanguage: 'chinese' | 'english'): void {
    this.translating = true;
    this.translationResult = null;
    
    const contentToTranslate = post.content;
    
    this.autobiographyService.translateContent(contentToTranslate, targetLanguage).subscribe({
      next: (response) => {
        if (response.success) {
          this.translationResult = response.translated;
          // Store translation in post
          if (!post.translatedContent) {
            post.translatedContent = {};
          }
          if (targetLanguage === 'chinese') {
            post.translatedContent.chinese = response.translated;
          } else {
            post.translatedContent.english = response.translated;
          }
        }
        this.translating = false;
      },
      error: (error) => {
        console.error('Error translating:', error);
        this.translating = false;
      }
    });
  }

  /**
   * Edit post
   */
  editPost(post: AutobiographyPost): void {
    this.editingPost = { ...post };
    this.selectedPost = post;
  }

  /**
   * Save edited post
   */
  saveEditedPost(): void {
    if (!this.editingPost) return;
    
    const index = this.editingPost.category === 'autobiography'
      ? this.autobiographyData.posts.findIndex(p => p.id === this.editingPost!.id)
      : this.whitePaperData.posts.findIndex(p => p.id === this.editingPost!.id);
    
    if (index >= 0) {
      if (this.editingPost.category === 'autobiography') {
        this.autobiographyData.posts[index] = { ...this.editingPost };
        this.saveAutobiography();
      } else {
        this.whitePaperData.posts[index] = { ...this.editingPost };
        this.saveWhitePaper();
      }
    }
    
    this.editingPost = null;
    this.selectedPost = null;
  }

  /**
   * Cancel editing
   */
  cancelEdit(): void {
    this.editingPost = null;
    this.selectedPost = null;
  }

  /**
   * Create new Reddit post
   */
  createRedditPost(): void {
    if (!this.newPostTitle || !this.newPostContent) {
      alert('Please provide both title and content');
      return;
    }
    
    this.creatingPost = true;
    this.autobiographyService.createRedditPost(this.newPostTitle, this.newPostContent, this.newPostSubreddit).subscribe({
      next: (response) => {
        if (response.success) {
          console.log('✅ Reddit post created:', response.postId);
          this.newPostTitle = '';
          this.newPostContent = '';
          this.loadRedditPosts(); // Reload to see new post
        } else {
          alert(`Failed to create post: ${response.error}`);
        }
        this.creatingPost = false;
      },
      error: (error) => {
        console.error('Error creating Reddit post:', error);
        alert('Failed to create Reddit post');
        this.creatingPost = false;
      }
    });
  }

  /**
   * Format date
   */
  formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }
}

