/**
 * Eden Identity System
 * 
 * Layered identity model:
 * 1. Google User (Authentication Only)
 * 2. Eden User (Global Identity)
 * 3. Garden Identity (Contextual Identity)
 * 4. Display Identity (What Others See)
 */

import * as crypto from 'crypto';

/**
 * Eden User (Global Identity)
 */
export interface EdenUser {
  userId: string;            // UUID
  googleUserId: string;      // OAuth sub
  primaryEmail: string;
  createdAt: number;

  globalUsername: string;    // unique across Eden, immutable
  globalNickname?: string;  // optional, changeable

  status: 'ACTIVE' | 'SUSPENDED';
}

/**
 * Garden User (Contextual Identity)
 */
export interface GardenUser {
  gardenId: string;
  userId: string;

  gardenUsername: string;      // unique within Garden
  gardenNickname?: string;    // display name, optional
  role: 'USER' | 'PRIEST' | 'OWNER';

  joinedAt: number;
}

// In-memory storage (in production, use Redis/database)
const EDEN_USERS: Map<string, EdenUser> = new Map(); // userId -> EdenUser
const EDEN_USERS_BY_GOOGLE_ID: Map<string, string> = new Map(); // googleUserId -> userId
const EDEN_USERS_BY_USERNAME: Map<string, string> = new Map(); // globalUsername -> userId
const GARDEN_USERS: Map<string, GardenUser> = new Map(); // `${gardenId}:${userId}` -> GardenUser
const GARDEN_USERNAMES: Map<string, Set<string>> = new Map(); // gardenId -> Set<gardenUsername>

/**
 * Initialize identity system
 */
export function initializeIdentity(): void {
  console.log('🎭 [Identity] Initializing identity system...');
  // Load from persistence if available
  loadIdentityPersistence();
  console.log(`✅ [Identity] Identity system initialized. Users: ${EDEN_USERS.size}, Garden users: ${GARDEN_USERS.size}`);
}

/**
 * Create new Eden user
 */
export function createEdenUser(
  googleUserId: string,
  email: string,
  globalUsername: string,
  globalNickname?: string
): EdenUser {
  // Validate username
  const validation = validateUsername(globalUsername);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid username');
  }

  // Check if username is taken
  if (EDEN_USERS_BY_USERNAME.has(globalUsername.toLowerCase())) {
    throw new Error('Username is already taken');
  }

  // Check if Google user already exists
  if (EDEN_USERS_BY_GOOGLE_ID.has(googleUserId)) {
    throw new Error('User already exists for this Google account');
  }

  const userId = crypto.randomUUID();
  const user: EdenUser = {
    userId,
    googleUserId,
    primaryEmail: email,
    createdAt: Date.now(),
    globalUsername,
    globalNickname,
    status: 'ACTIVE'
  };

  EDEN_USERS.set(userId, user);
  EDEN_USERS_BY_GOOGLE_ID.set(googleUserId, userId);
  EDEN_USERS_BY_USERNAME.set(globalUsername.toLowerCase(), userId);

  saveIdentityPersistence();
  console.log(`✅ [Identity] Created Eden user: ${globalUsername} (${userId})`);

  return user;
}

/**
 * Get Eden user by userId
 */
export function getEdenUser(userId: string): EdenUser | null {
  return EDEN_USERS.get(userId) || null;
}

/**
 * Get Eden user by Google userId
 */
export function getEdenUserByGoogleId(googleUserId: string): EdenUser | null {
  const userId = EDEN_USERS_BY_GOOGLE_ID.get(googleUserId);
  if (!userId) return null;
  return EDEN_USERS.get(userId) || null;
}

/**
 * Get Eden user by username
 */
export function getEdenUserByUsername(username: string): EdenUser | null {
  const userId = EDEN_USERS_BY_USERNAME.get(username.toLowerCase());
  if (!userId) return null;
  return EDEN_USERS.get(userId) || null;
}

/**
 * Check if username is available
 */
export function isUsernameAvailable(username: string): boolean {
  const validation = validateUsername(username);
  if (!validation.valid) {
    return false;
  }
  return !EDEN_USERS_BY_USERNAME.has(username.toLowerCase());
}

/**
 * Validate username format
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
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
 * Join Garden with optional username/nickname
 */
export function joinGarden(
  userId: string,
  gardenId: string,
  gardenUsername?: string,
  gardenNickname?: string
): GardenUser {
  const user = getEdenUser(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Use globalUsername if gardenUsername not provided
  const finalGardenUsername = gardenUsername || user.globalUsername;

  // Check if gardenUsername is available in this garden
  const gardenUsernames = GARDEN_USERNAMES.get(gardenId) || new Set();
  if (gardenUsernames.has(finalGardenUsername.toLowerCase())) {
    // Collision - add suffix
    let counter = 2;
    let candidate = `${finalGardenUsername}_${counter}`;
    while (gardenUsernames.has(candidate.toLowerCase())) {
      counter++;
      candidate = `${finalGardenUsername}_${counter}`;
    }
    throw new Error(`Username "${finalGardenUsername}" is taken in this garden. Suggested: "${candidate}"`);
  }

  const cacheKey = `${gardenId}:${userId}`;
  const existingGardenUser = GARDEN_USERS.get(cacheKey);
  
  if (existingGardenUser) {
    // Update existing garden user
    existingGardenUser.gardenUsername = finalGardenUsername;
    if (gardenNickname !== undefined) {
      existingGardenUser.gardenNickname = gardenNickname;
    }
    saveIdentityPersistence();
    return existingGardenUser;
  }

  // Create new garden user
  const gardenUser: GardenUser = {
    gardenId,
    userId,
    gardenUsername: finalGardenUsername,
    gardenNickname,
    role: 'USER', // Default role
    joinedAt: Date.now()
  };

  GARDEN_USERS.set(cacheKey, gardenUser);
  gardenUsernames.add(finalGardenUsername.toLowerCase());
  GARDEN_USERNAMES.set(gardenId, gardenUsernames);

  saveIdentityPersistence();
  console.log(`✅ [Identity] User ${user.globalUsername} joined garden ${gardenId} as ${finalGardenUsername}`);

  return gardenUser;
}

/**
 * Get Garden user
 */
export function getGardenUser(userId: string, gardenId: string): GardenUser | null {
  const cacheKey = `${gardenId}:${userId}`;
  return GARDEN_USERS.get(cacheKey) || null;
}

/**
 * Update garden nickname
 */
export function updateGardenNickname(
  userId: string,
  gardenId: string,
  nickname: string
): GardenUser {
  const cacheKey = `${gardenId}:${userId}`;
  const gardenUser = GARDEN_USERS.get(cacheKey);
  
  if (!gardenUser) {
    throw new Error('Garden user not found');
  }

  // Validate nickname
  if (nickname.length > 50) {
    throw new Error('Nickname must be 50 characters or less');
  }

  gardenUser.gardenNickname = nickname;
  saveIdentityPersistence();

  return gardenUser;
}

/**
 * Resolve display name (identity resolution order)
 */
export function resolveDisplayName(
  userId: string,
  gardenId?: string
): { displayName: string; username: string; nickname?: string; source: string } {
  const user = getEdenUser(userId);
  if (!user) {
    return {
      displayName: `user_${userId.substring(0, 8)}`,
      username: `user_${userId.substring(0, 8)}`,
      source: 'fallback'
    };
  }

  // If gardenId provided, check garden user first
  if (gardenId) {
    const gardenUser = getGardenUser(userId, gardenId);
    if (gardenUser) {
      // Priority 1: Garden nickname
      if (gardenUser.gardenNickname) {
        return {
          displayName: gardenUser.gardenNickname,
          username: gardenUser.gardenUsername,
          nickname: gardenUser.gardenNickname,
          source: 'gardenNickname'
        };
      }
      // Priority 2: Garden username
      return {
        displayName: gardenUser.gardenUsername,
        username: gardenUser.gardenUsername,
        source: 'gardenUsername'
      };
    }
  }

  // Priority 3: Global nickname
  if (user.globalNickname) {
    return {
      displayName: user.globalNickname,
      username: user.globalUsername,
      nickname: user.globalNickname,
      source: 'globalNickname'
    };
  }

  // Priority 4: Global username
  return {
    displayName: user.globalUsername,
    username: user.globalUsername,
    source: 'globalUsername'
  };
}

/**
 * Load identity persistence
 */
function loadIdentityPersistence(): void {
  try {
    const persistencePath = path.join(__dirname, '../eden-identity-persistence.json');
    if (fs.existsSync(persistencePath)) {
      const data = JSON.parse(fs.readFileSync(persistencePath, 'utf-8'));
      
      // Load Eden users
      if (data.edenUsers) {
        for (const user of data.edenUsers) {
          EDEN_USERS.set(user.userId, user);
          EDEN_USERS_BY_GOOGLE_ID.set(user.googleUserId, user.userId);
          EDEN_USERS_BY_USERNAME.set(user.globalUsername.toLowerCase(), user.userId);
        }
      }

      // Load Garden users
      if (data.gardenUsers) {
        for (const gardenUser of data.gardenUsers) {
          const cacheKey = `${gardenUser.gardenId}:${gardenUser.userId}`;
          GARDEN_USERS.set(cacheKey, gardenUser);
          
          const gardenUsernames = GARDEN_USERNAMES.get(gardenUser.gardenId) || new Set();
          gardenUsernames.add(gardenUser.gardenUsername.toLowerCase());
          GARDEN_USERNAMES.set(gardenUser.gardenId, gardenUsernames);
        }
      }

      console.log(`📦 [Identity] Loaded ${EDEN_USERS.size} Eden users and ${GARDEN_USERS.size} Garden users from persistence`);
    }
  } catch (error) {
    console.error('❌ [Identity] Failed to load identity persistence:', error);
  }
}

/**
 * Save identity persistence
 */
function saveIdentityPersistence(): void {
  try {
    const persistencePath = path.join(__dirname, '../eden-identity-persistence.json');
    const data = {
      edenUsers: Array.from(EDEN_USERS.values()),
      gardenUsers: Array.from(GARDEN_USERS.values()),
      savedAt: Date.now()
    };
    fs.writeFileSync(persistencePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ [Identity] Failed to save identity persistence:', error);
  }
}

// Import fs and path
import * as fs from 'fs';
import * as path from 'path';

