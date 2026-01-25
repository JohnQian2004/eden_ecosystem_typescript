import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { getApiBaseUrl } from './api-base';
import { 
  EdenUser, 
  GardenUser, 
  ResolvedIdentity, 
  UsernameRegistrationRequest,
  GardenJoinRequest 
} from '../models/identity.models';

@Injectable({
  providedIn: 'root'
})
export class IdentityService {
  private apiUrl = getApiBaseUrl();
  
  // Current user state
  private currentUserSubject = new BehaviorSubject<EdenUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  // Garden users cache (gardenId -> GardenUser)
  private gardenUsersCache = new Map<string, GardenUser>();

  constructor(private http: HttpClient) {
    // Load current user from localStorage on init
    this.loadCurrentUser();
  }

  /**
   * Resolve display name using identity resolution order:
   * 1. GardenNickname (if exists)
   * 2. GardenUsername
   * 3. GlobalNickname
   * 4. GlobalUsername
   * 5. Fallback: userId (never shown publicly)
   */
  resolveDisplayName(
    gardenUser?: GardenUser,
    user?: EdenUser,
    userId?: string
  ): ResolvedIdentity {
    // Priority 1: Garden nickname
    if (gardenUser?.gardenNickname) {
      return {
        displayName: gardenUser.gardenNickname,
        username: gardenUser.gardenUsername,
        nickname: gardenUser.gardenNickname,
        source: 'gardenNickname',
        gardenId: gardenUser.gardenId,
        role: gardenUser.role
      };
    }

    // Priority 2: Garden username
    if (gardenUser?.gardenUsername) {
      return {
        displayName: gardenUser.gardenUsername,
        username: gardenUser.gardenUsername,
        source: 'gardenUsername',
        gardenId: gardenUser.gardenId,
        role: gardenUser.role
      };
    }

    // Priority 3: Global nickname
    if (user?.globalNickname) {
      return {
        displayName: user.globalNickname,
        username: user.globalUsername,
        nickname: user.globalNickname,
        source: 'globalNickname'
      };
    }

    // Priority 4: Global username
    if (user?.globalUsername) {
      return {
        displayName: user.globalUsername,
        username: user.globalUsername,
        source: 'globalUsername'
      };
    }

    // Priority 5: Fallback (should never happen in production)
    const fallbackName = userId ? `user_${userId.substring(0, 8)}` : 'Anonymous';
    return {
      displayName: fallbackName,
      username: fallbackName,
      source: 'fallback'
    };
  }

  /**
   * Register new Eden user with username
   */
  registerUsername(request: UsernameRegistrationRequest): Observable<EdenUser> {
    return this.http.post<{ success: boolean; user: EdenUser }>(
      `${this.apiUrl}/api/identity/register`,
      request
    ).pipe(
      map(response => {
        if (response.success && response.user) {
          this.setCurrentUser(response.user);
          return response.user;
        }
        throw new Error('Registration failed');
      }),
      catchError(error => {
        console.error('❌ [IdentityService] Username registration failed:', error);
        throw error;
      })
    );
  }

  /**
   * Check if username is available
   */
  checkUsernameAvailability(username: string): Observable<boolean> {
    return this.http.get<{ available: boolean }>(
      `${this.apiUrl}/api/identity/username/check?username=${encodeURIComponent(username)}`
    ).pipe(
      map(response => response.available),
      catchError(() => of(false))
    );
  }

  /**
   * Get Eden user by userId
   */
  getUser(userId: string): Observable<EdenUser | null> {
    return this.http.get<{ success: boolean; user?: EdenUser }>(
      `${this.apiUrl}/api/identity/user/${userId}`
    ).pipe(
      map(response => response.user || null),
      catchError(() => of(null))
    );
  }

  /**
   * Get Eden user by Google userId
   */
  getUserByGoogleId(googleUserId: string): Observable<EdenUser | null> {
    return this.http.get<{ success: boolean; user?: EdenUser }>(
      `${this.apiUrl}/api/identity/user-by-google/${googleUserId}`
    ).pipe(
      map(response => response.user || null),
      catchError(() => of(null))
    );
  }

  /**
   * Get Eden user by email
   */
  getUserByEmail(email: string): Observable<EdenUser | null> {
    return this.http.get<{ success: boolean; user?: EdenUser }>(
      `${this.apiUrl}/api/identity/user-by-email/${encodeURIComponent(email)}`
    ).pipe(
      map(response => response.user || null),
      catchError(() => of(null))
    );
  }

  /**
   * Get Garden user (userId + gardenId)
   */
  getGardenUser(userId: string, gardenId: string): Observable<GardenUser | null> {
    const cacheKey = `${gardenId}:${userId}`;
    
    // Check cache first
    if (this.gardenUsersCache.has(cacheKey)) {
      return of(this.gardenUsersCache.get(cacheKey)!);
    }

    return this.http.get<{ success: boolean; gardenUser?: GardenUser }>(
      `${this.apiUrl}/api/identity/garden-user?userId=${userId}&gardenId=${gardenId}`
    ).pipe(
      map(response => {
        const gardenUser = response.gardenUser || null;
        if (gardenUser) {
          this.gardenUsersCache.set(cacheKey, gardenUser);
        }
        return gardenUser;
      }),
      catchError(() => of(null))
    );
  }

  /**
   * Join a Garden with optional username/nickname
   */
  joinGarden(request: GardenJoinRequest): Observable<GardenUser> {
    return this.http.post<{ success: boolean; gardenUser: GardenUser }>(
      `${this.apiUrl}/api/identity/garden/join`,
      request
    ).pipe(
      map(response => {
        if (response.success && response.gardenUser) {
          const cacheKey = `${response.gardenUser.gardenId}:${response.gardenUser.userId}`;
          this.gardenUsersCache.set(cacheKey, response.gardenUser);
          return response.gardenUser;
        }
        throw new Error('Garden join failed');
      }),
      catchError(error => {
        console.error('❌ [IdentityService] Garden join failed:', error);
        throw error;
      })
    );
  }

  /**
   * Update garden nickname
   */
  updateGardenNickname(
    userId: string,
    gardenId: string,
    nickname: string
  ): Observable<GardenUser> {
    return this.http.put<{ success: boolean; gardenUser: GardenUser }>(
      `${this.apiUrl}/api/identity/garden-user/nickname`,
      { userId, gardenId, nickname }
    ).pipe(
      map(response => {
        if (response.success && response.gardenUser) {
          const cacheKey = `${gardenId}:${userId}`;
          this.gardenUsersCache.set(cacheKey, response.gardenUser);
          return response.gardenUser;
        }
        throw new Error('Nickname update failed');
      }),
      catchError(error => {
        console.error('❌ [IdentityService] Nickname update failed:', error);
        throw error;
      })
    );
  }

  /**
   * Set current user (from authentication)
   */
  setCurrentUser(user: EdenUser | null): void {
    this.currentUserSubject.next(user);
    if (user) {
      localStorage.setItem('eden_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('eden_user');
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): EdenUser | null {
    return this.currentUserSubject.value;
  }

  /**
   * Load current user from localStorage
   */
  private loadCurrentUser(): void {
    try {
      const stored = localStorage.getItem('eden_user');
      if (stored) {
        const user = JSON.parse(stored) as EdenUser;
        this.currentUserSubject.next(user);
      }
    } catch (error) {
      console.error('❌ [IdentityService] Failed to load user from localStorage:', error);
    }
  }

  /**
   * Clear current user (logout)
   */
  clearCurrentUser(): void {
    this.setCurrentUser(null);
    this.gardenUsersCache.clear();
  }

  /**
   * Validate username format
   */
  validateUsername(username: string): { valid: boolean; error?: string } {
    if (!username || username.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters' };
    }
    if (username.length > 30) {
      return { valid: false, error: 'Username must be 30 characters or less' };
    }
    // ASCII-safe, alphanumeric + underscore + hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
    }
    // Cannot start with number
    if (/^[0-9]/.test(username)) {
      return { valid: false, error: 'Username cannot start with a number' };
    }
    return { valid: true };
  }

  /**
   * Validate nickname format
   */
  validateNickname(nickname: string): { valid: boolean; error?: string } {
    if (!nickname || nickname.length < 1) {
      return { valid: false, error: 'Nickname cannot be empty' };
    }
    if (nickname.length > 50) {
      return { valid: false, error: 'Nickname must be 50 characters or less' };
    }
    // Allow emojis and unicode, but check for profanity server-side
    return { valid: true };
  }
}

