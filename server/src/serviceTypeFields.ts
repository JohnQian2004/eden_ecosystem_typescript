/**
 * Service Type Field Mapping
 * Maps service-type-specific field names to a common structure
 */

export interface ServiceTypeFieldMapping {
  primary: string; // Primary identifier (e.g., movieTitle, flightNumber)
  time: string; // Time/date field (e.g., showtime, date)
  location: string; // Location field (e.g., location, destination)
  price: string; // Price field (usually 'price')
  provider: string; // Provider name field (usually 'providerName')
  [key: string]: string; // Allow additional fields
}

export const SERVICE_TYPE_FIELDS: Record<string, ServiceTypeFieldMapping> = {
  movie: {
    primary: 'movieTitle',
    time: 'showtime',
    location: 'location',
    price: 'price',
    provider: 'providerName',
    genre: 'genre',
    duration: 'duration',
    format: 'format'
  },
  airline: {
    primary: 'flightNumber',
    time: 'date',
    location: 'destination',
    price: 'price',
    provider: 'providerName',
    departure: 'departure',
    arrival: 'arrival'
  },
  autoparts: {
    primary: 'partName',
    time: 'availability',
    location: 'warehouse',
    price: 'price',
    provider: 'providerName',
    partNumber: 'partNumber',
    category: 'category'
  },
  hotel: {
    primary: 'hotelName',
    time: 'checkIn',
    location: 'location',
    price: 'price',
    provider: 'providerName',
    checkOut: 'checkOut',
    roomType: 'roomType'
  },
  restaurant: {
    primary: 'restaurantName',
    time: 'reservationTime',
    location: 'location',
    price: 'price',
    provider: 'providerName',
    cuisine: 'cuisine',
    partySize: 'partySize'
  }
};

/**
 * Get field mapping for a service type
 */
export function getServiceTypeFields(serviceType: string): ServiceTypeFieldMapping {
  return SERVICE_TYPE_FIELDS[serviceType] || {
    primary: 'name',
    time: 'date',
    location: 'location',
    price: 'price',
    provider: 'providerName'
  };
}

/**
 * Extract booking details from a listing based on service type
 */
export function extractBookingDetails(serviceType: string, listing: any): Record<string, any> {
  const fields = getServiceTypeFields(serviceType);
  const details: Record<string, any> = {
    price: listing[fields.price] || listing.price
  };

  // Add primary field
  if (listing[fields.primary]) {
    details[fields.primary] = listing[fields.primary];
  }

  // Add time field
  if (listing[fields.time]) {
    details[fields.time] = listing[fields.time];
  }

  // Add location field
  if (listing[fields.location]) {
    details[fields.location] = listing[fields.location];
  }

  // Add provider
  if (listing[fields.provider]) {
    details.providerName = listing[fields.provider];
  }

  // Add all other mapped fields (departure, arrival, etc.)
  Object.keys(fields).forEach(key => {
    if (key !== 'primary' && key !== 'time' && key !== 'location' && key !== 'price' && key !== 'provider') {
      const fieldName = fields[key];
      if (listing[fieldName]) {
        details[fieldName] = listing[fieldName];
      }
    }
  });

  // Also include any additional fields from the listing that might be useful
  // This ensures we capture all relevant booking information
  if (serviceType === 'airline') {
    if (listing.departure) details.departure = listing.departure;
    if (listing.arrival) details.arrival = listing.arrival;
    if (listing.flightNumber) details.flightNumber = listing.flightNumber;
    if (listing.destination) details.destination = listing.destination;
    if (listing.date) details.date = listing.date;
  } else if (serviceType === 'autoparts') {
    if (listing.partName) details.partName = listing.partName;
    if (listing.partNumber) details.partNumber = listing.partNumber;
    if (listing.category) details.category = listing.category;
    if (listing.warehouse) details.warehouse = listing.warehouse;
    if (listing.availability) details.availability = listing.availability;
  } else if (serviceType === 'hotel') {
    if (listing.hotelName) details.hotelName = listing.hotelName;
    if (listing.checkIn) details.checkIn = listing.checkIn;
    if (listing.checkOut) details.checkOut = listing.checkOut;
    if (listing.roomType) details.roomType = listing.roomType;
    if (listing.location) details.location = listing.location;
  } else if (serviceType === 'restaurant') {
    if (listing.restaurantName) details.restaurantName = listing.restaurantName;
    if (listing.reservationTime) details.reservationTime = listing.reservationTime;
    if (listing.cuisine) details.cuisine = listing.cuisine;
    if (listing.partySize) details.partySize = listing.partySize;
    if (listing.location) details.location = listing.location;
  }

  return details;
}

/**
 * Get service-type-agnostic message template
 */
export function getServiceTypeMessage(serviceType: string, count: number): string {
  const messages: Record<string, string> = {
    movie: `Found ${count} great movie option${count !== 1 ? 's' : ''}! Here are the best matches for your request.`,
    airline: `Found ${count} great flight option${count !== 1 ? 's' : ''}! Here are the best matches for your request.`,
    autoparts: `Found ${count} great auto part${count !== 1 ? 's' : ''}! Here are the best matches for your request.`,
    hotel: `Found ${count} great hotel option${count !== 1 ? 's' : ''}! Here are the best matches for your request.`,
    restaurant: `Found ${count} great restaurant option${count !== 1 ? 's' : ''}! Here are the best matches for your request.`
  };

  return messages[serviceType] || `Found ${count} great option${count !== 1 ? 's' : ''}! Here are the best matches for your request.`;
}

/**
 * Format recommendations for a listing based on service type
 */
export function formatRecommendation(serviceType: string, listing: any, index: number): any {
  const fields = getServiceTypeFields(serviceType);
  
  const recommendation: any = {
    rank: index + 1,
    price: listing[fields.price] || listing.price,
    provider: listing[fields.provider] || listing.providerName,
    rating: listing.rating
  };

  // Add primary field
  if (listing[fields.primary]) {
    recommendation[fields.primary] = listing[fields.primary];
  }

  // Add time field
  if (listing[fields.time]) {
    recommendation[fields.time] = listing[fields.time];
  }

  return recommendation;
}

