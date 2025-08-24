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

// Geocode an address string to get coordinates and formatted address
export async function geocodeAddress(address: string): Promise<FormattedAddress | null> {
  try {
    // Request permission if not already granted
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[geocoding] Location permission not granted');
    }
    
    // Geocode the address
    const geocoded = await Location.geocodeAsync(address);
    
    if (!geocoded || geocoded.length === 0) {
      console.warn('[geocoding] No results found for address:', address);
      return null;
    }
    
    const location = geocoded[0];
    
    // Reverse geocode to get formatted address components
    const reverseGeocode = await Location.reverseGeocodeAsync({
      latitude: location.latitude,
      longitude: location.longitude,
    });
    
    if (!reverseGeocode || reverseGeocode.length === 0) {
      // Return basic result if reverse geocoding fails
      return {
        fullAddress: address,
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
      streetName: addressComponents.street || addressComponents.name || undefined,
      city: addressComponents.city || undefined,
      state: addressComponents.region || undefined,
      zipCode: addressComponents.postalCode || undefined,
      country: addressComponents.country || undefined,
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    };
    
    // Generate full address string
    formatted.fullAddress = formatAddressString(formatted);
    
    // If the formatted address is empty, use the original
    if (!formatted.fullAddress) {
      formatted.fullAddress = address;
    }
    
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

// Mock geocoding for web (since expo-location doesn't work on web)
export async function geocodeAddressWeb(address: string): Promise<FormattedAddress | null> {
  // For web, we'll return a mock formatted address
  // In production, you'd use Google Maps Geocoding API
  
  // Simple parsing to extract components
  const parts = address.split(',').map(p => p.trim());
  
  // Generate mock coordinates based on address hash
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash) + address.charCodeAt(i);
    hash = hash & hash;
  }
  
  const lat = 37.7749 + (Math.abs(hash % 1000) / 10000); // San Francisco area
  const lng = -122.4194 + (Math.abs(hash % 1000) / 10000);
  
  return {
    fullAddress: address,
    streetName: parts[0] || undefined,
    city: parts[1] || 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    country: 'United States',
    coordinates: {
      latitude: lat,
      longitude: lng,
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
