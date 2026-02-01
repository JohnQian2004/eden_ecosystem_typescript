/**
 * Eden Identity Models
 * 
 * Layered identity system:
 * 1. Google User (Authentication Only)
 * 2. Eden User (Global Identity)
 * 3. Garden Identity (Contextual Identity)
 * 4. Display Identity (What Others See)
 */

/**
 * Google User (Authentication Only)
 * Google provides authentication, not identity control
 */
export interface GoogleUser {
  googleUserId: string;      // OAuth sub
  email: string;             // Verified email
  email_verified: boolean;
}

/**
 * Eden User (Global Identity)
 * Canonical identity inside Eden
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
 * Garden Identity (Contextual Identity)
 * User can appear differently in each Garden
 */
export interface GardenUser {
  gardenId: string;
  userId: string;

  gardenUsername: string;      // unique within Garden
  gardenNickname?: string;    // display name, optional
  role: 'USER' | 'PRIEST' | 'OWNER';

  joinedAt: number;
}

/**
 * Garden Model (Domain-Aware)
 */
export interface Garden {
  gardenId: string;

  gardenSlug: string;        // unique, URL-safe
  domain?: string;           // optional custom domain (e.g., "baycounter.com")

  displayName: string;
  ownerUserId: string;
  
  // Naming policy
  namingPolicy?: {
    allowNicknames: boolean;
    profanityFilter: boolean;
    collisionResolution: 'suffix' | 'reject' | 'manual';
  };
}

/**
 * Identity Resolution Result
 */
export interface ResolvedIdentity {
  displayName: string;
  username: string;
  nickname?: string;
  source: 'gardenNickname' | 'gardenUsername' | 'globalNickname' | 'globalUsername' | 'fallback';
  gardenId?: string;
  role?: 'USER' | 'PRIEST' | 'OWNER';
}

/**
 * Username Registration Request
 */
export interface UsernameRegistrationRequest {
  googleUserId: string;
  email: string;
  globalUsername: string;
  globalNickname?: string;
}

/**
 * Garden Join Request (with naming)
 */
export interface GardenJoinRequest {
  userId: string;
  gardenId: string;
  gardenUsername?: string;  // optional, defaults to globalUsername
  gardenNickname?: string;  // optional
}

