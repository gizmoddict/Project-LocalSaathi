/**
 * Hyperlocal Geocoding & Reverse Geocoding Client
 * Supports OpenStreetMap Nominatim, custom geocoding proxies, and local trade hub fallbacks.
 */

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  addressLine?: string;
  locality?: string;
  city?: string;
  state?: string;
  pinCode?: string;
}

// Curated verified trade hubs across North India for offline resilience & instant suggestions
export const FALLBACK_GEOCODING_DATABASE: GeocodingResult[] = [
  {
    latitude: 26.8500,
    longitude: 80.9480,
    displayName: 'Hazratganj, Lucknow, Uttar Pradesh 226001',
    addressLine: 'Hazratganj Market',
    locality: 'Hazratganj',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pinCode: '226001',
  },
  {
    latitude: 26.8900,
    longitude: 80.9400,
    displayName: 'Aliganj, Lucknow, Uttar Pradesh 226024',
    addressLine: 'Sector B, Kapoorthala',
    locality: 'Aliganj',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pinCode: '226024',
  },
  {
    latitude: 26.8600,
    longitude: 80.9900,
    displayName: 'Gomti Nagar, Lucknow, Uttar Pradesh 226010',
    addressLine: 'Vibhuti Khand',
    locality: 'Gomti Nagar',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pinCode: '226010',
  },
  {
    latitude: 26.8800,
    longitude: 80.9800,
    displayName: 'Indira Nagar, Lucknow, Uttar Pradesh 226016',
    addressLine: 'Block A, Munshipulia',
    locality: 'Indira Nagar',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pinCode: '226016',
  },
  {
    latitude: 26.8200,
    longitude: 80.9200,
    displayName: 'Charbagh Railway Station, Lucknow, Uttar Pradesh 226004',
    addressLine: 'Charbagh Station Circle',
    locality: 'Charbagh',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pinCode: '226004',
  },
  {
    latitude: 28.6300,
    longitude: 77.2200,
    displayName: 'Connaught Place, New Delhi, Delhi 110001',
    addressLine: 'Inner Circle, Rajiv Chowk',
    locality: 'Connaught Place',
    city: 'New Delhi',
    state: 'Delhi',
    pinCode: '110001',
  },
  {
    latitude: 28.5700,
    longitude: 77.3200,
    displayName: 'Sector 18, Noida, Gautam Buddha Nagar, Uttar Pradesh 201301',
    addressLine: 'Atta Market, Sector 18',
    locality: 'Sector 18',
    city: 'Noida',
    state: 'Uttar Pradesh',
    pinCode: '201301',
  },
  {
    latitude: 28.4595,
    longitude: 77.0266,
    displayName: 'DLF Cyber City, Sector 24, Gurugram, Haryana 122002',
    addressLine: 'Cyber Hub, DLF Phase 2',
    locality: 'DLF Phase 2',
    city: 'Gurugram',
    state: 'Haryana',
    pinCode: '122002',
  },
  {
    latitude: 26.4499,
    longitude: 80.3319,
    displayName: 'Civil Lines, Kanpur, Uttar Pradesh 208001',
    addressLine: 'Mall Road',
    locality: 'Civil Lines',
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    pinCode: '208001',
  },
  {
    latitude: 25.3176,
    longitude: 82.9739,
    displayName: 'Godowlia Chowk, Varanasi, Uttar Pradesh 221001',
    addressLine: 'Godowlia-Dashashwamedh Road',
    locality: 'Godowlia',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    pinCode: '221001',
  },
];

// In-memory caching for query and reverse lookups
const searchCache = new Map<string, { timestamp: number; results: GeocodingResult[] }>();
const reverseCache = new Map<string, { timestamp: number; result: GeocodingResult }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getMapTileConfig() {
  return {
    tileUrl:
      process.env.NEXT_PUBLIC_MAP_TILE_URL ||
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    minZoom: 4,
  };
}

/**
 * Searches places, areas, cities, or PIN codes using configured provider
 * with offline fallback support.
 */
export async function searchPlaces(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const cacheKey = trimmed.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }

  // 1. Check local fallback database matches
  const localMatches = FALLBACK_GEOCODING_DATABASE.filter((item) => {
    const q = cacheKey;
    return (
      item.displayName.toLowerCase().includes(q) ||
      (item.locality && item.locality.toLowerCase().includes(q)) ||
      (item.city && item.city.toLowerCase().includes(q)) ||
      (item.pinCode && item.pinCode.includes(q))
    );
  });

  // 2. Query configured external geocoding provider
  try {
    const customBaseUrl = process.env.NEXT_PUBLIC_GEOCODING_BASE_URL;
    const provider = process.env.NEXT_PUBLIC_GEOCODING_PROVIDER || 'nominatim';

    let endpoint = '';
    if (customBaseUrl) {
      endpoint = `${customBaseUrl}/search?format=json&addressdetails=1&q=${encodeURIComponent(trimmed)}&limit=5`;
    } else if (provider === 'nominatim') {
      endpoint = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=in&q=${encodeURIComponent(trimmed)}&limit=5`;
    }

    if (endpoint) {
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LocalSaathi-Web/1.0 (contact@localsaathi.in)',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const apiResults: GeocodingResult[] = data.map((item: any) => {
            const addr = item.address || {};
            const locality =
              addr.suburb ||
              addr.neighbourhood ||
              addr.residential ||
              addr.quarter ||
              addr.commercial ||
              addr.village ||
              addr.road;
            const city =
              addr.city ||
              addr.town ||
              addr.state_district ||
              addr.county ||
              addr.city_district;
            const state = addr.state;
            const pinCode = addr.postcode;

            return {
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
              displayName: item.display_name,
              addressLine: addr.road || addr.pedestrian || addr.amenity || locality,
              locality,
              city,
              state,
              pinCode,
            };
          });

          // Combine with any exact local matches not in API
          const combined = [...apiResults];
          for (const local of localMatches) {
            if (!combined.some((c) => Math.abs(c.latitude - local.latitude) < 0.01 && Math.abs(c.longitude - local.longitude) < 0.01)) {
              combined.push(local);
            }
          }

          searchCache.set(cacheKey, { timestamp: Date.now(), results: combined });
          return combined;
        }
      }
    }
  } catch {
    // Network or rate-limit failure: gracefully fall back to local database
  }

  // Fallback to local trade hubs
  searchCache.set(cacheKey, { timestamp: Date.now(), results: localMatches });
  return localMatches;
}

/**
 * Reverse geocodes coordinates into structured address components.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodingResult> {
  const latRound = latitude.toFixed(4);
  const lonRound = longitude.toFixed(4);
  const cacheKey = `${latRound},${lonRound}`;

  const cached = reverseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // 1. Try external provider
  try {
    const customBaseUrl = process.env.NEXT_PUBLIC_GEOCODING_BASE_URL;
    const provider = process.env.NEXT_PUBLIC_GEOCODING_PROVIDER || 'nominatim';

    let endpoint = '';
    if (customBaseUrl) {
      endpoint = `${customBaseUrl}/reverse?format=json&addressdetails=1&lat=${latitude}&lon=${longitude}`;
    } else if (provider === 'nominatim') {
      endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${latitude}&lon=${longitude}`;
    }

    if (endpoint) {
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LocalSaathi-Web/1.0 (contact@localsaathi.in)',
        },
      });

      if (response.ok) {
        const item = await response.json();
        if (item && item.address) {
          const addr = item.address;
          const locality =
            addr.suburb ||
            addr.neighbourhood ||
            addr.residential ||
            addr.quarter ||
            addr.commercial ||
            addr.village ||
            addr.road ||
            'Local Area';
          const city =
            addr.city ||
            addr.town ||
            addr.state_district ||
            addr.county ||
            addr.city_district ||
            'District';
          const state = addr.state || 'India';
          const pinCode = addr.postcode || undefined;
          const addressLine = addr.road || addr.pedestrian || addr.amenity || locality;

          const result: GeocodingResult = {
            latitude,
            longitude,
            displayName: item.display_name || `${locality}, ${city}, ${state}`,
            addressLine,
            locality,
            city,
            state,
            pinCode,
          };

          reverseCache.set(cacheKey, { timestamp: Date.now(), result });
          return result;
        }
      }
    }
  } catch {
    // Fall back to nearest known trade hub or coordinate synthesis
  }

  // 2. Find closest local trade hub (within 30km)
  let nearest: GeocodingResult | null = null;
  let minDistance = Infinity;

  for (const hub of FALLBACK_GEOCODING_DATABASE) {
    const dLat = hub.latitude - latitude;
    const dLon = hub.longitude - longitude;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = hub;
    }
  }

  if (nearest && minDistance < 0.3) { // ~30km
    const result: GeocodingResult = {
      latitude,
      longitude,
      displayName: `Near ${nearest.locality}, ${nearest.city}, ${nearest.state}`,
      addressLine: nearest.addressLine,
      locality: nearest.locality,
      city: nearest.city,
      state: nearest.state,
      pinCode: nearest.pinCode,
    };
    reverseCache.set(cacheKey, { timestamp: Date.now(), result });
    return result;
  }

  // Generic fallback if completely remote
  const fallbackResult: GeocodingResult = {
    latitude,
    longitude,
    displayName: `Selected Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    locality: 'Selected Locality',
    city: 'Local Region',
    state: 'India',
  };
  reverseCache.set(cacheKey, { timestamp: Date.now(), result: fallbackResult });
  return fallbackResult;
}
