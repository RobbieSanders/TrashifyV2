import * as Location from 'expo-location';
import { Platform } from 'react-native';

export interface FormattedAddress {
  fullAddress: string;
  streetNumber?: string;
  streetName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

// State abbreviation to full name mapping
const STATE_ABBREVIATIONS: { [key: string]: string } = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming'
};

// Major US cities with their coordinates for validation
const MAJOR_CITIES: { [key: string]: { lat: number; lng: number; state: string } } = {
  'san francisco': { lat: 37.7749, lng: -122.4194, state: 'CA' },
  'los angeles': { lat: 34.0522, lng: -118.2437, state: 'CA' },
  'san diego': { lat: 32.7157, lng: -117.1611, state: 'CA' },
  'miami': { lat: 25.7617, lng: -80.1918, state: 'FL' },
  'orlando': { lat: 28.5383, lng: -81.3792, state: 'FL' },
  'tampa': { lat: 27.9506, lng: -82.4572, state: 'FL' },
  'jacksonville': { lat: 30.3322, lng: -81.6557, state: 'FL' },
  'new york': { lat: 40.7128, lng: -74.0060, state: 'NY' },
  'chicago': { lat: 41.8781, lng: -87.6298, state: 'IL' },
  'houston': { lat: 29.7604, lng: -95.3698, state: 'TX' },
  'phoenix': { lat: 33.4484, lng: -112.0740, state: 'AZ' },
  'philadelphia': { lat: 39.9526, lng: -75.1652, state: 'PA' },
  'san antonio': { lat: 29.4241, lng: -98.4936, state: 'TX' },
  'dallas': { lat: 32.7767, lng: -96.7970, state: 'TX' },
  'austin': { lat: 30.2672, lng: -97.7431, state: 'TX' },
  'seattle': { lat: 47.6062, lng: -122.3321, state: 'WA' },
  'denver': { lat: 39.7392, lng: -104.9903, state: 'CO' },
  'boston': { lat: 42.3601, lng: -71.0589, state: 'MA' },
  'atlanta': { lat: 33.7490, lng: -84.3880, state: 'GA' },
  'las vegas': { lat: 36.1699, lng: -115.1398, state: 'NV' },
  'portland': { lat: 45.5152, lng: -122.6784, state: 'OR' },
  'detroit': { lat: 42.3314, lng: -83.0458, state: 'MI' },
  'minneapolis': { lat: 44.9778, lng: -93.2650, state: 'MN' },
  'charlotte': { lat: 35.2271, lng: -80.8431, state: 'NC' },
  'nashville': { lat: 36.1627, lng: -86.7816, state: 'TN' },
  'baltimore': { lat: 39.2904, lng: -76.6122, state: 'MD' },
  'milwaukee': { lat: 43.0389, lng: -87.9065, state: 'WI' },
  'salt lake city': { lat: 40.7608, lng: -111.8910, state: 'UT' },
  'kansas city': { lat: 39.0997, lng: -94.5786, state: 'MO' },
  'st louis': { lat: 38.6270, lng: -90.1994, state: 'MO' },
  'new orleans': { lat: 29.9511, lng: -90.0715, state: 'LA' },
  'pittsburgh': { lat: 40.4406, lng: -79.9959, state: 'PA' },
  'cincinnati': { lat: 39.1031, lng: -84.5120, state: 'OH' },
  'sacramento': { lat: 38.5816, lng: -121.4944, state: 'CA' },
  'cleveland': { lat: 41.4993, lng: -81.6944, state: 'OH' },
  'indianapolis': { lat: 39.7684, lng: -86.1581, state: 'IN' },
  'columbus': { lat: 39.9612, lng: -82.9988, state: 'OH' },
  'san jose': { lat: 37.3382, lng: -121.8863, state: 'CA' },
  'memphis': { lat: 35.1495, lng: -90.0490, state: 'TN' },
  'louisville': { lat: 38.2527, lng: -85.7585, state: 'KY' },
  'richmond': { lat: 37.5407, lng: -77.4360, state: 'VA' },
  'oklahoma city': { lat: 35.4676, lng: -97.5164, state: 'OK' },
  'raleigh': { lat: 35.7796, lng: -78.6382, state: 'NC' },
  'birmingham': { lat: 33.5186, lng: -86.8104, state: 'AL' },
  'buffalo': { lat: 42.8864, lng: -78.8784, state: 'NY' },
  'rochester': { lat: 43.1566, lng: -77.6088, state: 'NY' },
  'des moines': { lat: 41.5868, lng: -93.6250, state: 'IA' },
  'tulsa': { lat: 36.1540, lng: -95.9928, state: 'OK' },
  'omaha': { lat: 41.2565, lng: -95.9345, state: 'NE' },
  'oakland': { lat: 37.8044, lng: -122.2712, state: 'CA' },
  'fresno': { lat: 36.7378, lng: -119.7871, state: 'CA' },
  'long beach': { lat: 33.7701, lng: -118.1937, state: 'CA' }
};

// Parse address components from a string
export function parseAddressComponents(address: string): {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
} {
  const components: any = {};
  
  // Clean up the address
  const cleanAddress = address.trim().replace(/\s+/g, ' ');
  
  // Extract ZIP code
  const zipMatch = cleanAddress.match(/\b(\d{5})(-\d{4})?\b/);
  if (zipMatch) {
    components.zipCode = zipMatch[1];
  }
  
  // Split by comma for standard address format
  const parts = cleanAddress.split(',').map(p => p.trim());
  
  if (parts.length >= 1) {
    components.street = parts[0];
  }
  
  if (parts.length >= 2) {
    components.city = parts[1];
  }
  
  if (parts.length >= 3) {
    // Parse state and zip from last part
    const stateZipPart = parts[2];
    
    // Check for state abbreviation
    const stateMatch = stateZipPart.match(/\b([A-Z]{2})\b/);
    if (stateMatch) {
      components.state = stateMatch[1];
    } else {
      // Check for full state name
      const statePart = stateZipPart.replace(/\d{5}(-\d{4})?/, '').trim();
      if (statePart) {
        // Try to match against known states
        const upperStatePart = statePart.toUpperCase();
        for (const [abbr, fullName] of Object.entries(STATE_ABBREVIATIONS)) {
          if (fullName.toUpperCase() === upperStatePart || abbr === upperStatePart) {
            components.state = abbr;
            break;
          }
        }
        if (!components.state) {
          components.state = statePart;
        }
      }
    }
  }
  
  return components;
}

// Format address components into a proper address string
export function formatAddressString(components: Partial<FormattedAddress>): string {
  const parts = [];
  
  if (components.streetNumber && components.streetName) {
    parts.push(`${components.streetNumber} ${components.streetName}`);
  } else if (components.streetName) {
    parts.push(components.streetName);
  }
  
  if (components.city) {
    parts.push(components.city);
  }
  
  if (components.state && components.zipCode) {
    parts.push(`${components.state} ${components.zipCode}`);
  } else if (components.state) {
    parts.push(components.state);
  } else if (components.zipCode) {
    parts.push(components.zipCode);
  }
  
  if (components.country && components.country !== 'United States') {
    parts.push(components.country);
  }
  
  return parts.join(', ');
}

// Validate address components and ensure they match
export function validateAddressComponents(address: string, coordinates: { latitude: number; longitude: number }): boolean {
  const components = parseAddressComponents(address);
  
  // If we have a city and state, validate against known cities
  if (components.city && components.state) {
    const cityKey = components.city.toLowerCase();
    const cityData = MAJOR_CITIES[cityKey];
    
    if (cityData) {
      // Check if the state matches
      if (cityData.state !== components.state && 
          STATE_ABBREVIATIONS[components.state] !== STATE_ABBREVIATIONS[cityData.state]) {
        console.warn(`[geocoding] State mismatch: ${components.city} is in ${cityData.state}, not ${components.state}`);
        return false;
      }
      
      // Check if coordinates are reasonably close (within ~100 miles)
      const distance = Math.sqrt(
        Math.pow(coordinates.latitude - cityData.lat, 2) + 
        Math.pow(coordinates.longitude - cityData.lng, 2)
      );
      
      if (distance > 2) { // Roughly 100+ miles
        console.warn(`[geocoding] Coordinates too far from ${components.city}, ${components.state}`);
        return false;
      }
    }
  }
  
  // Validate ZIP code against coordinates if present
  if (components.zipCode) {
    const zipPrefix = parseInt(components.zipCode.substring(0, 2));
    
    // Check if coordinates match expected region for ZIP prefix
    // Florida ZIPs: 32-34
    if (zipPrefix >= 32 && zipPrefix <= 34) {
      if (coordinates.latitude < 24 || coordinates.latitude > 31 || 
          coordinates.longitude < -88 || coordinates.longitude > -79) {
        console.warn(`[geocoding] Florida ZIP ${components.zipCode} but coordinates outside Florida`);
        return false;
      }
    }
    // California ZIPs: 90-96
    else if (zipPrefix >= 90 && zipPrefix <= 96) {
      if (coordinates.latitude < 32 || coordinates.latitude > 42 || 
          coordinates.longitude < -125 || coordinates.longitude > -114) {
        console.warn(`[geocoding] California ZIP ${components.zipCode} but coordinates outside California`);
        return false;
      }
    }
  }
  
  return true;
}

// Geocode an address string to get coordinates and formatted address
export async function geocodeAddress(address: string): Promise<FormattedAddress | null> {
  try {
    // Request permission if not already granted
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[geocoding] Location permission not granted');
    }
    
    // Parse address components first
    const components = parseAddressComponents(address);
    
    // Build a more complete address string if we have components
    let geocodeQuery = address;
    if (components.city && components.state) {
      // Ensure we include city and state in the query
      geocodeQuery = `${components.street || ''}, ${components.city}, ${components.state} ${components.zipCode || ''}`.trim();
    }
    
    console.log('[geocoding] Geocoding query:', geocodeQuery);
    
    // Geocode the address
    const geocoded = await Location.geocodeAsync(geocodeQuery);
    
    if (!geocoded || geocoded.length === 0) {
      console.warn('[geocoding] No results found for address:', geocodeQuery);
      return null;
    }
    
    const location = geocoded[0];
    
    // Validate the geocoded coordinates against the address components
    if (!validateAddressComponents(address, location)) {
      console.warn('[geocoding] Address validation failed, trying alternative geocoding');
      // Try with just city and state if validation failed
      if (components.city && components.state) {
        const cityStateQuery = `${components.city}, ${components.state}`;
        const altGeocoded = await Location.geocodeAsync(cityStateQuery);
        if (altGeocoded && altGeocoded.length > 0) {
          location.latitude = altGeocoded[0].latitude;
          location.longitude = altGeocoded[0].longitude;
        }
      }
    }
    
    // Reverse geocode to get formatted address components
    const reverseGeocode = await Location.reverseGeocodeAsync({
      latitude: location.latitude,
      longitude: location.longitude,
    });
    
    if (!reverseGeocode || reverseGeocode.length === 0) {
      // Return basic result if reverse geocoding fails
      return {
        fullAddress: address,
        city: components.city,
        state: components.state,
        zipCode: components.zipCode,
        coordinates: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
      };
    }
    
    const addressComponents = reverseGeocode[0];
    
    // Build formatted address
    const formatted: FormattedAddress = {
      fullAddress: '',
      streetNumber: addressComponents.streetNumber || undefined,
      streetName: addressComponents.street || addressComponents.name || components.street || undefined,
      city: addressComponents.city || components.city || undefined,
      state: addressComponents.region || components.state || undefined,
      zipCode: addressComponents.postalCode || components.zipCode || undefined,
      country: addressComponents.country || 'United States',
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    };
    
    // Generate full address string
    formatted.fullAddress = formatAddressString(formatted) || address;
    
    console.log('[geocoding] Geocoded address:', formatted);
    return formatted;
  } catch (error) {
    console.error('[geocoding] Error geocoding address:', error);
    return null;
  }
}

// Search for address suggestions (autocomplete)
export async function searchAddresses(query: string): Promise<string[]> {
  try {
    if (query.length < 3) {
      return [];
    }
    
    // For now, we'll use geocoding to get suggestions
    // In production, you'd want to use Google Places API or similar
    const results = await Location.geocodeAsync(query);
    
    if (!results || results.length === 0) {
      return [];
    }
    
    // Get formatted addresses for each result
    const suggestions: string[] = [];
    for (const result of results.slice(0, 5)) { // Limit to 5 suggestions
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: result.latitude,
        longitude: result.longitude,
      });
      
      if (reverseGeocode && reverseGeocode.length > 0) {
        const addr = reverseGeocode[0];
        const formatted = formatAddressString({
          streetNumber: addr.streetNumber || undefined,
          streetName: addr.street || addr.name || undefined,
          city: addr.city || undefined,
          state: addr.region || undefined,
          zipCode: addr.postalCode || undefined,
        });
        
        if (formatted && !suggestions.includes(formatted)) {
          suggestions.push(formatted);
        }
      }
    }
    
    return suggestions;
  } catch (error) {
    console.error('[geocoding] Error searching addresses:', error);
    return [];
  }
}

// Validate if an address can be geocoded
export async function validateAddress(address: string): Promise<boolean> {
  try {
    const result = await geocodeAddress(address);
    return result !== null;
  } catch {
    return false;
  }
}

// Get current location and format as address
export async function getCurrentLocationAddress(): Promise<FormattedAddress | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[geocoding] Location permission not granted');
      return null;
    }
    
    const location = await Location.getCurrentPositionAsync({});
    
    const reverseGeocode = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
    
    if (!reverseGeocode || reverseGeocode.length === 0) {
      return null;
    }
    
    const addressComponents = reverseGeocode[0];
    
    const formatted: FormattedAddress = {
      fullAddress: '',
      streetNumber: addressComponents.streetNumber || undefined,
      streetName: addressComponents.street || addressComponents.name || undefined,
      city: addressComponents.city || undefined,
      state: addressComponents.region || undefined,
      zipCode: addressComponents.postalCode || undefined,
      country: addressComponents.country || undefined,
      coordinates: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
    };
    
    formatted.fullAddress = formatAddressString(formatted);
    
    console.log('[geocoding] Current location address:', formatted);
    return formatted;
  } catch (error) {
    console.error('[geocoding] Error getting current location:', error);
    return null;
  }
}

// Enhanced web geocoding with better validation
export async function geocodeAddressWeb(address: string): Promise<FormattedAddress | null> {
  try {
    console.log('[geocoding] Web geocoding for address:', address);
    
    // Parse address components
    const components = parseAddressComponents(address);
    console.log('[geocoding] Parsed components:', components);
    
    // Build a structured query for better results
    let structuredQuery = address;
    if (components.city && components.state) {
      structuredQuery = `${components.street || ''}, ${components.city}, ${components.state}, USA`.trim();
    }
    
    // First, check if we can use known city coordinates
    if (components.city && components.state) {
      const cityKey = components.city.toLowerCase();
      const cityData = MAJOR_CITIES[cityKey];
      
      if (cityData && (cityData.state === components.state || 
          STATE_ABBREVIATIONS[components.state] === STATE_ABBREVIATIONS[cityData.state])) {
        console.log('[geocoding] Using known coordinates for', components.city, components.state);
        return {
          fullAddress: address,
          streetName: components.street,
          city: components.city,
          state: components.state,
          zipCode: components.zipCode,
          country: 'United States',
          coordinates: {
            latitude: cityData.lat,
            longitude: cityData.lng,
          },
        };
      }
    }
    
    // Use Nominatim API (free OpenStreetMap geocoding service)
    const encodedAddress = encodeURIComponent(structuredQuery);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&countrycodes=us&limit=5`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Trashify Cleaning App'
      }
    });
    
    if (!response.ok) {
      console.warn('[geocoding] Nominatim API request failed:', response.statusText);
      return geocodeAddressWebFallback(address);
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.warn('[geocoding] No results from Nominatim for:', structuredQuery);
      return geocodeAddressWebFallback(address);
    }
    
    // Find the best match based on address components
    let bestMatch = data[0];
    for (const result of data) {
      // Check if this result matches our expected state
      if (components.state && result.display_name) {
        const displayLower = result.display_name.toLowerCase();
        const stateLower = components.state.toLowerCase();
        const stateFullLower = STATE_ABBREVIATIONS[components.state]?.toLowerCase() || stateLower;
        
        if (displayLower.includes(stateLower) || displayLower.includes(stateFullLower)) {
          bestMatch = result;
          break;
        }
      }
    }
    
    const coordinates = {
      latitude: parseFloat(bestMatch.lat),
      longitude: parseFloat(bestMatch.lon),
    };
    
    // Validate the coordinates against the address components
    if (!validateAddressComponents(address, coordinates)) {
      console.warn('[geocoding] Validation failed for Nominatim result, using fallback');
      return geocodeAddressWebFallback(address);
    }
    
    return {
      fullAddress: address,
      streetName: components.street,
      city: components.city,
      state: components.state,
      zipCode: components.zipCode,
      country: 'United States',
      coordinates,
    };
  } catch (error) {
    console.error('[geocoding] Error with web geocoding:', error);
    return geocodeAddressWebFallback(address);
  }
}

// Fallback geocoding when API fails
function geocodeAddressWebFallback(address: string): FormattedAddress | null {
  console.log('[geocoding] Using fallback geocoding for:', address);
  
  const components = parseAddressComponents(address);
  
  // If we have a city and state, try to use known city coordinates
  if (components.city && components.state) {
    const cityKey = components.city.toLowerCase();
    const cityData = MAJOR_CITIES[cityKey];
    
    if (cityData) {
      // Verify state matches
      if (cityData.state === components.state || 
          STATE_ABBREVIATIONS[components.state] === STATE_ABBREVIATIONS[cityData.state]) {
        console.log('[geocoding] Fallback: Using known city coordinates for', components.city);
        return {
          fullAddress: address,
          streetName: components.street,
          city: components.city,
          state: components.state,
          zipCode: components.zipCode,
          country: 'United States',
          coordinates: {
            latitude: cityData.lat,
            longitude: cityData.lng,
          },
        };
      }
    }
  }
  
  // Use state-based coordinates as last resort
  const stateCoordinates: { [key: string]: { lat: number; lng: number } } = {
    'FL': { lat: 27.6648, lng: -81.5158 }, // Florida center
    'CA': { lat: 36.7783, lng: -119.4179 }, // California center
    'TX': { lat: 31.9686, lng: -99.9018 }, // Texas center
    'NY': { lat: 43.0000, lng: -75.0000 }, // New York center
    'IL': { lat: 40.6331, lng: -89.3985 }, // Illinois center
    'PA': { lat: 41.2033, lng: -77.1945 }, // Pennsylvania center
    'OH': { lat: 40.4173, lng: -82.9071 }, // Ohio center
    'GA': { lat: 32.1656, lng: -82.9001 }, // Georgia center
    'NC': { lat: 35.7596, lng: -79.0193 }, // North Carolina center
    'MI': { lat: 44.3148, lng: -85.6024 }, // Michigan center
  };
  
  let coordinates = { lat: 39.8283, lng: -98.5795 }; // US center as default
  
  if (components.state && stateCoordinates[components.state]) {
    coordinates = stateCoordinates[components.state];
    console.log('[geocoding] Fallback: Using state center for', components.state);
  }
  
  return {
    fullAddress: address,
    streetName: components.street,
    city: components.city,
    state: components.state,
    zipCode: components.zipCode,
    country: 'United States',
    coordinates: {
      latitude: coordinates.lat,
      longitude: coordinates.lng,
    },
  };
}

// Platform-specific geocoding
export async function geocodeAddressCrossPlatform(address: string): Promise<FormattedAddress | null> {
  if (Platform.OS === 'web') {
    return geocodeAddressWeb(address);
  }
  return geocodeAddress(address);
}
