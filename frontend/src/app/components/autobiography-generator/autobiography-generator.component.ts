/**
 * Autobiography Generator Component
 * Paste posts → save to Redis (no Reddit fetch or posting).
 * Rich text editor for content (Paste and Edit).
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { AutobiographyService, RedditPost, AutobiographyPost, AutobiographyData } from '../../services/autobiography.service';
import { Editor } from 'ngx-editor';

@Component({
  selector: 'app-autobiography-generator',
  templateUrl: './autobiography-generator.component.html',
  styleUrls: ['./autobiography-generator.component.scss']
})
export class AutobiographyGeneratorComponent implements OnInit, OnDestroy {
  pasteEditor!: Editor;
  editEditor!: Editor;
  // Paste post (save to Redis)
  pasteTitle = '';
  pasteContent = '';
  pasteCategory: 'autobiography' | 'white_paper' = 'autobiography';
  pasting = false;
  pasteMessage = '';
  pasteSuccess = false;

  // Autobiography and White Paper data
  autobiographyData: AutobiographyData = { version: '2.6', lastUpdated: '', posts: [] };
  whitePaperData: AutobiographyData = { version: '2.6', lastUpdated: '', posts: [] };
  loadingAutobiography = false;
  loadingWhitePaper = false;
  saving = false;

  // UI state
  activeTab: 'paste' | 'autobiography' | 'white_paper' = 'paste';
  selectedPost: RedditPost | AutobiographyPost | null = null;
  editingPost: AutobiographyPost | null = null;
  /** Which content tab is shown in the chapter detail: original, English, or Chinese. */
  detailContentTab: 'original' | 'english' | 'chinese' = 'original';
  translating = false;
  translationResult: string | null = null;

  constructor(private autobiographyService: AutobiographyService) {}

  ngOnInit(): void {
    this.pasteEditor = new Editor();
    this.editEditor = new Editor();
    this.loadAutobiography();
    this.loadWhitePaper();
  }

  ngOnDestroy(): void {
    this.pasteEditor.destroy();
    this.editEditor.destroy();
  }

  /**
   * Check if content has actual text (handles HTML from rich editor).
   */
  hasContent(content: string | undefined | null): boolean {
    if (!content) return false;
    const stripped = content.replace(/<[^>]*>/g, '').trim();
    return stripped.length > 0;
  }

  /**
   * Paste one post: save to Redis and file (no Reddit).
   */
  pastePost(): void {
    const title = this.pasteTitle?.trim();
    // Do not trim content - preserve rich text (HTML, <p>, spaces, paragraphs) when saving to Redis
    const content = typeof this.pasteContent === 'string' ? this.pasteContent : '';
    if (!title || !this.hasContent(content)) return;
    this.pasting = true;
    this.pasteMessage = '';
    this.autobiographyService.pastePost(title, content, this.pasteCategory).subscribe({
      next: (response) => {
        this.pasting = false;
        if (response.success) {
          this.pasteSuccess = true;
          this.pasteMessage = 'Saved to Redis and file.';
          this.pasteTitle = '';
          this.pasteContent = '';
          if (this.pasteCategory === 'autobiography') this.loadAutobiography();
          else this.loadWhitePaper();
        } else {
          this.pasteSuccess = false;
          this.pasteMessage = response.error || 'Save failed';
        }
      },
      error: (error) => {
        this.pasting = false;
        this.pasteSuccess = false;
        this.pasteMessage = error?.error?.error || error?.message || 'Request failed';
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
   * Move post up in autobiography list (by sorted chapter index).
   */
  moveUpAutobiography(sortedIndex: number): void {
    if (sortedIndex <= 0) return;
    const sorted = this.sortedAutobiographyPosts;
    const post = sorted[sortedIndex];
    const posts = this.autobiographyData.posts;
    const idx = posts.findIndex(p => p.id === post.id);
    if (idx <= 0) return;
    [posts[idx - 1], posts[idx]] = [posts[idx], posts[idx - 1]];
    posts.forEach((p, i) => (p.order = i));
    this.saveAutobiography();
  }

  /**
   * Move post down in autobiography list (by sorted chapter index).
   */
  moveDownAutobiography(sortedIndex: number): void {
    const sorted = this.sortedAutobiographyPosts;
    if (sortedIndex >= sorted.length - 1) return;
    const post = sorted[sortedIndex];
    const posts = this.autobiographyData.posts;
    const idx = posts.findIndex(p => p.id === post.id);
    if (idx < 0 || idx >= posts.length - 1) return;
    [posts[idx], posts[idx + 1]] = [posts[idx + 1], posts[idx]];
    posts.forEach((p, i) => (p.order = i));
    this.saveAutobiography();
  }

  /**
   * Move post up in white paper list (by sorted chapter index).
   */
  moveUpWhitePaper(sortedIndex: number): void {
    if (sortedIndex <= 0) return;
    const sorted = this.sortedWhitePaperPosts;
    const post = sorted[sortedIndex];
    const posts = this.whitePaperData.posts;
    const idx = posts.findIndex(p => p.id === post.id);
    if (idx <= 0) return;
    [posts[idx - 1], posts[idx]] = [posts[idx], posts[idx - 1]];
    posts.forEach((p, i) => (p.order = i));
    this.saveWhitePaper();
  }

  /**
   * Move post down in white paper list (by sorted chapter index).
   */
  moveDownWhitePaper(sortedIndex: number): void {
    const sorted = this.sortedWhitePaperPosts;
    if (sortedIndex >= sorted.length - 1) return;
    const post = sorted[sortedIndex];
    const posts = this.whitePaperData.posts;
    const idx = posts.findIndex(p => p.id === post.id);
    if (idx < 0 || idx >= posts.length - 1) return;
    [posts[idx], posts[idx + 1]] = [posts[idx + 1], posts[idx]];
    posts.forEach((p, i) => (p.order = i));
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
   * Translate content and save the result to Redis (per-chapter Chinese/English versions).
   */
  translatePost(post: AutobiographyPost, targetLanguage: 'chinese' | 'english'): void {
    if (!this.editingPost || this.editingPost.id !== post.id) return;
    this.translating = true;
    this.translationResult = null;

    const contentToTranslate = post.content;

    this.autobiographyService.translateContent(contentToTranslate, targetLanguage).subscribe({
      next: (response) => {
        if (response.success) {
          this.translationResult = response.translated;
          if (!this.editingPost) return;
          if (!this.editingPost.translatedContent) {
            this.editingPost.translatedContent = {};
          }
          if (targetLanguage === 'chinese') {
            this.editingPost.translatedContent.chinese = response.translated;
            this.detailContentTab = 'chinese';
          } else {
            this.editingPost.translatedContent.english = response.translated;
            this.detailContentTab = 'english';
          }
          this.persistEditingPostToRedis();
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
   * Write current editingPost back into the list and save to Redis (no close).
   */
  persistEditingPostToRedis(): void {
    if (!this.editingPost) return;
    const index = this.editingPost.category === 'autobiography'
      ? this.autobiographyData.posts.findIndex(p => p.id === this.editingPost!.id)
      : this.whitePaperData.posts.findIndex(p => p.id === this.editingPost!.id);
    if (index < 0) return;
    const copy = {
      ...this.editingPost,
      translatedContent: this.editingPost.translatedContent
        ? { ...this.editingPost.translatedContent }
        : undefined
    };
    if (this.editingPost.category === 'autobiography') {
      this.autobiographyData.posts[index] = copy;
      this.saveAutobiography();
    } else {
      this.whitePaperData.posts[index] = copy;
      this.saveWhitePaper();
    }
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
    
    this.closeChapterDetail();
  }

  /**
   * Cancel editing
   */
  cancelEdit(): void {
    this.editingPost = null;
    this.selectedPost = null;
  }

  /**
   * Format date
   */
  formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  /** Posts sorted by order (chapter number). */
  get sortedAutobiographyPosts(): AutobiographyPost[] {
    return [...this.autobiographyData.posts].sort((a, b) => a.order - b.order);
  }

  /** White paper posts sorted by order (chapter number). */
  get sortedWhitePaperPosts(): AutobiographyPost[] {
    return [...this.whitePaperData.posts].sort((a, b) => a.order - b.order);
  }

  /** Chapter number for display (1-based). */
  chapterNumber(order: number): number {
    return order + 1;
  }

  /** Index of post in autobiography list (by id). */
  autobiographyIndex(post: AutobiographyPost): number {
    return this.autobiographyData.posts.findIndex(p => p.id === post.id);
  }

  /** Index of post in white paper list (by id). */
  whitePaperIndex(post: AutobiographyPost): number {
    return this.whitePaperData.posts.findIndex(p => p.id === post.id);
  }

  /** Select chapter to view/edit (opens detail panel). */
  selectChapter(post: AutobiographyPost): void {
    this.editingPost = {
      ...post,
      translatedContent: post.translatedContent ? { ...post.translatedContent } : undefined
    };
    this.selectedPost = post;
    this.detailContentTab = 'original';
    this.translationResult = null;
  }

  /** Close chapter detail panel. */
  closeChapterDetail(): void {
    this.editingPost = null;
    this.selectedPost = null;
    this.translationResult = null;
  }
}

