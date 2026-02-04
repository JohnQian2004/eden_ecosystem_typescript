/**
 * In-Memory Store for TikTok-like features
 * Works without Redis - stores likes and follows in memory
 * Data is lost on server restart, but works immediately without setup
 */

interface LikeData {
  videoId: string;
  userId: string;
  timestamp: number;
}

interface FollowData {
  userId: string;
  authorId: string;
  timestamp: number;
}

class MemoryStore {
  // Map<videoId, Set<userId>> - tracks which users liked which videos
  private videoLikes: Map<string, Set<string>> = new Map();
  
  // Map<userId, Set<authorId>> - tracks which users follow which authors
  private userFollows: Map<string, Set<string>> = new Map();
  
  // Map<authorId, Set<userId>> - tracks which users follow an author (reverse index)
  private authorFollowers: Map<string, Set<string>> = new Map();

  /**
   * Like/Unlike a video
   */
  likeVideo(videoId: string, userId: string = 'anonymous'): boolean {
    if (!this.videoLikes.has(videoId)) {
      this.videoLikes.set(videoId, new Set());
    }
    
    const likes = this.videoLikes.get(videoId)!;
    if (likes.has(userId)) {
      // Unlike
      likes.delete(userId);
      return false;
    } else {
      // Like
      likes.add(userId);
      return true;
    }
  }

  /**
   * Check if user liked a video
   */
  hasUserLikedVideo(videoId: string, userId: string = 'anonymous'): boolean {
    const likes = this.videoLikes.get(videoId);
    return likes ? likes.has(userId) : false;
  }

  /**
   * Get like count for a video
   */
  getVideoLikeCount(videoId: string): number {
    const likes = this.videoLikes.get(videoId);
    return likes ? likes.size : 0;
  }

  /**
   * Get like counts for multiple videos
   */
  getVideoLikeCounts(videoIds: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    videoIds.forEach(videoId => {
      counts[videoId] = this.getVideoLikeCount(videoId);
    });
    return counts;
  }

  /**
   * Follow/Unfollow an author
   */
  followUser(authorId: string, userId: string = 'anonymous'): boolean {
    // User follows author
    if (!this.userFollows.has(userId)) {
      this.userFollows.set(userId, new Set());
    }
    const follows = this.userFollows.get(userId)!;
    
    // Author's followers
    if (!this.authorFollowers.has(authorId)) {
      this.authorFollowers.set(authorId, new Set());
    }
    const followers = this.authorFollowers.get(authorId)!;
    
    if (follows.has(authorId)) {
      // Unfollow
      follows.delete(authorId);
      followers.delete(userId);
      return false;
    } else {
      // Follow
      follows.add(authorId);
      followers.add(userId);
      return true;
    }
  }

  /**
   * Check if user follows an author
   */
  hasUserFollowedAuthor(authorId: string, userId: string = 'anonymous'): boolean {
    const follows = this.userFollows.get(userId);
    return follows ? follows.has(authorId) : false;
  }

  /**
   * Get follower count for an author
   */
  getAuthorFollowerCount(authorId: string): number {
    const followers = this.authorFollowers.get(authorId);
    return followers ? followers.size : 0;
  }

  /**
   * Get follow statuses for multiple authors
   */
  getAuthorFollowStatuses(authorIds: string[], userId: string = 'anonymous'): Record<string, boolean> {
    const statuses: Record<string, boolean> = {};
    authorIds.forEach(authorId => {
      statuses[authorId] = this.hasUserFollowedAuthor(authorId, userId);
    });
    return statuses;
  }
}

// Singleton instance
export const memoryStore = new MemoryStore();

