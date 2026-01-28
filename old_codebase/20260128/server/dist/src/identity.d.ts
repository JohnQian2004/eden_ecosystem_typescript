/**
 * Eden Identity System
 *
 * Layered identity model:
 * 1. Google User (Authentication Only)
 * 2. Eden User (Global Identity)
 * 3. Garden Identity (Contextual Identity)
 * 4. Display Identity (What Others See)
 */
/**
 * Eden User (Global Identity)
 */
export interface EdenUser {
    userId: string;
    googleUserId: string;
    primaryEmail: string;
    createdAt: number;
    globalUsername: string;
    globalNickname?: string;
    status: 'ACTIVE' | 'SUSPENDED';
}
/**
 * Garden User (Contextual Identity)
 */
export interface GardenUser {
    gardenId: string;
    userId: string;
    gardenUsername: string;
    gardenNickname?: string;
    role: 'USER' | 'PRIEST' | 'OWNER';
    joinedAt: number;
}
/**
 * Initialize identity system
 */
export declare function initializeIdentity(): void;
/**
 * Create new Eden user
 */
export declare function createEdenUser(googleUserId: string, email: string, globalUsername: string, globalNickname?: string): EdenUser;
/**
 * Get Eden user by userId
 */
export declare function getEdenUser(userId: string): EdenUser | null;
/**
 * Get Eden user by Google userId
 */
export declare function getEdenUserByGoogleId(googleUserId: string): EdenUser | null;
/**
 * Get Eden user by username
 */
export declare function getEdenUserByUsername(username: string): EdenUser | null;
/**
 * Get Eden user by email
 */
export declare function getEdenUserByEmail(email: string): EdenUser | null;
/**
 * Check if username is available
 */
export declare function isUsernameAvailable(username: string): boolean;
/**
 * Validate username format
 */
export declare function validateUsername(username: string): {
    valid: boolean;
    error?: string;
};
/**
 * Join Garden with optional username/nickname
 */
export declare function joinGarden(userId: string, gardenId: string, gardenUsername?: string, gardenNickname?: string): GardenUser;
/**
 * Get Garden user
 */
export declare function getGardenUser(userId: string, gardenId: string): GardenUser | null;
/**
 * Update garden nickname
 */
export declare function updateGardenNickname(userId: string, gardenId: string, nickname: string): GardenUser;
/**
 * Resolve display name (identity resolution order)
 */
export declare function resolveDisplayName(userId: string, gardenId?: string): {
    displayName: string;
    username: string;
    nickname?: string;
    source: string;
};
//# sourceMappingURL=identity.d.ts.map