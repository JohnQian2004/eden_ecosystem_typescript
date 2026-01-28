/**
 * Garden Module
 * Handles garden certificate issuance and registration
 */
import type { GardenConfig } from "./types";
import type { EdenCertificate } from "../EdenPKI";
/**
 * Initialize garden module with dependencies
 */
export declare function initializeGarden(broadcastFn: (event: any) => void, redisInstance: any): void;
/**
 * Issue a certificate to a garden
 */
export declare function issueGardenCertificate(garden: GardenConfig): EdenCertificate;
/**
 * Register a new movie garden
 * Note: In ROOT mode, this should NOT be called directly - gardens should be created via Angular wizard
 */
export declare function registerNewMovieGarden(email: string, stripePaymentIntentId: string, stripeCustomerId?: string | null, stripePaymentMethodId?: string | null, stripeSessionId?: string): Promise<GardenConfig>;
//# sourceMappingURL=garden.d.ts.map