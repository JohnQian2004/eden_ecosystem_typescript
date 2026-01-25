import type { EdenCertificate } from "../EdenPKI";

// Garden Configuration Types
export interface GardenConfig {
  id: string;
  name: string;
  stream: string;
  active: boolean;
  uuid: string;
  certificate?: EdenCertificate;
  pki?: any; // Store PKI instance for signing revocations
  ownerEmail?: string; // Priest user email who owns this garden (for lifecycle management)
  priestEmail?: string; // Alias for ownerEmail (backward compatibility)
}

export interface TokenGardenConfig extends GardenConfig {
  tokenServiceType: 'dex'; // Specialized for DEX services
}

// User and Transaction Types
export type User = {
  id: string;
  email: string;
  balance: number;
};

export type TransactionSnapshot = {
  chainId: string;
  txId: string;
  slot: number;
  blockTime: number;
  payer: string;
  merchant: string;
  amount: number;
  feeSplit: Record<string, number>;
};

export type LedgerEntry = {
  entryId: string;
  txId: string;
  timestamp: number;
  payer: string; // Email address
  payerId: string; // User ID for internal tracking
  merchant: string;
  providerUuid: string; // Service provider UUID for certificate issuance
  serviceType: string; // 'movie', 'dex', 'mint', 'transaction', etc.
  amount: number;
  iGasCost: number;
  fees: Record<string, number>;
  status: 'pending' | 'processed' | 'completed' | 'failed';
  cashierId: string;
  bookingDetails?: {
    // Generic fields - service-type agnostic
    price?: number;
    providerName?: string;
    location?: string;
    // Movie-specific fields
    movieTitle?: string;
    showtime?: string;
    // Airline-specific fields
    flightNumber?: string;
    destination?: string;
    date?: string;
    departure?: string;
    arrival?: string;
    // Autoparts-specific fields
    partName?: string;
    partNumber?: string;
    category?: string;
    warehouse?: string;
    availability?: string;
    // Hotel-specific fields
    hotelName?: string;
    checkIn?: string;
    checkOut?: string;
    roomType?: string;
    // Restaurant-specific fields
    restaurantName?: string;
    reservationTime?: string;
    cuisine?: string;
    partySize?: number;
    // DEX trade details
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    tokenAmount?: number;
    baseAmount?: number;
    iTax?: number;
    // JSC Mint details (Stripe payment rail)
    stripePaymentIntentId?: string;
    stripeCustomerId?: string;
    stripePaymentMethodId?: string;
    stripeSessionId?: string;
    asset?: string; // 'JSC' for JesusCoin
    // Generic catch-all for any other service type fields
    [key: string]: any;
  };
};

export type Cashier = {
  id: string;
  name: string;
  processedCount: number;
  totalProcessed: number;
  status: 'active' | 'idle';
};

export type Review = {
  userId: string;
  movieId: string;
  rating: number;
};

// Service Provider Types
export type ServiceProvider = {
  id: string;
  uuid: string; // UUID for certificate issuance
  name: string;
  serviceType: string;
  location: string;
  bond: number;
  reputation: number;
  gardenId: string; // Standardized field name - used everywhere (persistence, memory, API)
  apiEndpoint?: string; // Optional API endpoint for the provider
  status?: 'active' | 'revoked' | 'suspended'; // Provider status
  // Snake Service Fields (serviceType: "snake")
  // Note: Snake is a SERVICE TYPE (like "movie", "dex"), not a provider type
  // Each Snake service belongs to a garden (gardenId)
  insuranceFee?: number; // Higher insurance fee for Snake services (default: same as bond)
  iGasMultiplier?: number; // iGas multiplier (default: 1.0, Snake: 2.0)
  iTaxMultiplier?: number; // iTax multiplier (default: 1.0, Snake: 2.0)
  maxInfluence?: number; // Maximum influence score (0.0-1.0, default: 0.15 for Snake)
  contextsAllowed?: string[]; // Contexts where Snake service can operate
  contextsForbidden?: string[]; // Contexts where Snake service is banned
  adCapabilities?: string[]; // Advertising capabilities (e.g., ["product_promotion", "service_highlighting"])
};

export type ServiceProviderWithCert = ServiceProvider & {
  certificate?: EdenCertificate;
};

export type ServiceProviderWithCert = ServiceProvider & {
  certificate?: EdenCertificate;
};

// Movie Listing Types
export type MovieListing = {
  providerId: string;
  providerName: string;
  movieTitle: string;
  movieId: string;
  price: number;
  showtime: string;
  location: string;
  reviewCount: number;
  rating: number;
  gardenId: string;
};

// DEX Pool Types
export type TokenPool = {
  poolId: string;
  tokenSymbol: string;
  tokenName: string;
  baseToken: string; // SOL, USDC, etc.
  poolLiquidity: number; // Total liquidity in base token
  tokenReserve: number; // Amount of tokens in pool
  baseReserve: number; // Amount of base token in pool
  price: number; // Current price (baseToken per token)
  bond: number; // Creator bond
  gardenId: string; // Garden providing this pool service
  createdAt: number;
  totalVolume: number;
  totalTrades: number;
  // Stripe Payment Rail binding and liquidity certification
  stripePaymentRailBound?: boolean;
  liquidityCertified?: boolean;
  initialLiquidity?: number;
  stripePaymentIntentId?: string;
};

export type TokenListing = {
  poolId: string;
  providerId: string; // Garden ID providing the pool
  providerName: string;
  tokenSymbol: string;
  tokenName: string;
  baseToken: string;
  price: number; // Current price
  liquidity: number;
  volume24h: number;
  indexerId: string;
};

// Generic listing type for ANY other service type (airline, pharmacy, autoparts, etc.)
// Used by provider plugins (e.g., SQL-backed providers).
export type GenericServiceListing = {
  providerId: string;
  providerName: string;
  gardenId: string;
  price: number;
  location?: string;
  rating?: number;
  [key: string]: any;
};

export type DEXTrade = {
  tradeId: string;
  poolId: string;
  tokenSymbol: string;
  baseToken: string;
  action: 'BUY' | 'SELL';
  tokenAmount: number;
  baseAmount: number;
  price: number;
  priceImpact: number; // 0.001% per trade
  iTax: number; // 0.0005% commission
  timestamp: number;
  trader: string; // User email
};

// Service Registry Query Types
export type ServiceRegistryQuery = {
  serviceType?: string; // Optional: filter by service type
  providerType?: 'REGULAR' | 'SNAKE'; // Optional: filter by provider type (for Snake providers)
  filters?: {
    location?: string;
    maxPrice?: number | string; // Can be a number or 'best'/'lowest'
    minReputation?: number;
    genre?: string;
    time?: string;
    // DEX-specific filters
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    tokenAmount?: number;
    maxPriceImpact?: number;
  };
};

// LLM Types
export type LLMQueryResult = {
  query: ServiceRegistryQuery;
  serviceType: string;
  confidence: number;
};

export type LLMResponse = {
  message: string;
  listings: MovieListing[] | TokenListing[] | GenericServiceListing[];
  selectedListing: MovieListing | TokenListing | GenericServiceListing | null;
  selectedListing2?: MovieListing | TokenListing | GenericServiceListing | null; // DEBUG: Track lifecycle separately
  iGasCost: number;
  tradeDetails?: DEXTrade; // For DEX trades
  shouldRouteToGodInbox?: boolean; // If true, route message to GOD's inbox
};

// Wallet Types
export interface WalletIntent {
  intent: "CREDIT" | "DEBIT" | "HOLD" | "RELEASE";
  email: string;
  amount: number;
  txId: string;
  entryId?: string;
  reason: string;
  metadata?: Record<string, any>;
}

export interface WalletResult {
  success: boolean;
  balance: number;
  previousBalance?: number;
  error?: string;
}

