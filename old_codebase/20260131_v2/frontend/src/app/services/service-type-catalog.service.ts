/**
 * Service Type Catalog
 * Single source of truth for service type metadata (icons, ad text, sample queries)
 */

export interface ServiceTypeCatalogEntry {
  type: string;
  icon: string;
  adText: string;
  sampleQuery: string;
}

export const SERVICE_TYPE_CATALOG: ServiceTypeCatalogEntry[] = [
  {
    type: 'movie',
    icon: '🎬',
    adText: 'Movie Tickets',
    sampleQuery: 'I want a sci-fi movie to watch tonight at the best price'
  },
  {
    type: 'dex',
    icon: '💰',
    adText: 'DEX Tokens',
    sampleQuery: 'Trade 2 SOL with TOKEN'
  },
  {
    type: 'airline',
    icon: '✈️',
    adText: 'Airline Tickets',
    sampleQuery: 'I want to book a flight from New York to Los Angeles next week at the best price'
  },
  {
    type: 'autoparts',
    icon: '🔧',
    adText: 'Auto Parts',
    sampleQuery: 'I need brake pads for a 2006 Nissan Altima front bumper at the best price'
  },
  {
    type: 'hotel',
    icon: '🏨',
    adText: 'Hotel Booking',
    sampleQuery: 'I want to book a hotel in San Francisco for 3 nights at the best price'
  },
  {
    type: 'restaurant',
    icon: '🍽️',
    adText: 'Restaurant Reservations',
    sampleQuery: 'I want to make a dinner reservation for 2 people tonight at the best restaurant'
  },
  {
    type: 'grocerystore',
    icon: '🛒',
    adText: 'Grocery Store',
    sampleQuery: 'I want to find a grocery store near me with fresh Orange produce at the best prices'
  },
  {
    type: 'pharmacy',
    icon: '💊',
    adText: 'Pharmacy',
    sampleQuery: 'I need to find a pharmacy that has my prescription medication available'
  },
  {
    type: 'dogpark',
    icon: '🐕',
    adText: 'Dog Park',
    sampleQuery: 'I want to find a dog park near me with off-leash areas and water fountains'
  },
  {
    type: 'gasstation',
    icon: '⛽',
    adText: 'Gas Station',
    sampleQuery: 'I need to find a gas station with premium fuel at the best price'
  },
  {
    type: 'party',
    icon: '🎉',
    adText: 'Party & Events',
    sampleQuery: 'I want to find a party or event happening this weekend and purchase tickets'
  },
  {
    type: 'bank',
    icon: '🏦',
    adText: 'Banking Services',
    sampleQuery: 'I need to find a bank near me with ATM access and business banking services'
  }
];

/**
 * Get a catalog entry by service type
 */
export function getCatalogEntry(serviceType?: string): ServiceTypeCatalogEntry | undefined {
  if (!serviceType) return undefined;
  const st = String(serviceType).toLowerCase().trim();
  return SERVICE_TYPE_CATALOG.find(s => s.type === st);
}

/**
 * Get icon for a service type
 */
export function getServiceTypeIcon(serviceType?: string): string {
  return getCatalogEntry(serviceType)?.icon || '🌿';
}

