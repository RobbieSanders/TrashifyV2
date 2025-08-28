import { Platform } from 'react-native';

// You'll need to add your Google Maps API key here
// Get one from: https://console.cloud.google.com/google/maps-apis/
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export interface GeocodedAddress {
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
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Geocode an address using Google Maps Geocoding API
 * This provides accurate, worldwide geocoding with proper validation
 */
export async function geocodeWithGoogle(address: string): Promise<GeocodedAddress | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('[GoogleGeocoding] No API key configured. Please add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to your .env file');
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'ZERO_RESULTS') {
      console.warn('[GoogleGeocoding] No results found for address:', address);
      return null;
    }
    
    if (data.status !== 'OK') {
      console.error('[GoogleGeocoding] API error:', data.status, data.error_message);
      return null;
    }
    
    const result = data.results[0];
    
    // Extract address components
    const components: any = {};
    result.address_components.forEach((component: any) => {
      const types = component.types;
      
      if (types.includes('street_number')) {
        components.streetNumber = component.long_name;
      }
      if (types.includes('route')) {
        components.streetName = component.long_name;
      }
      if (types.includes('locality')) {
        components.city = component.long_name;
      }
      if (types.includes('administrative_area_level_1')) {
        components.state = component.short_name;
      }
      if (types.includes('postal_code')) {
        components.zipCode = component.long_name;
      }
      if (types.includes('country')) {
        components.country = component.long_name;
      }
    });
    
    // Determine confidence level based on location type
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (result.geometry.location_type === 'ROOFTOP') {
      confidence = 'high';
    } else if (result.geometry.location_type === 'RANGE_INTERPOLATED') {
      confidence = 'medium';
    }
    
    return {
      fullAddress: result.formatted_address,
      streetNumber: components.streetNumber,
      streetName: components.streetName,
      city: components.city,
      state: components.state,
      zipCode: components.zipCode,
      country: components.country,
      coordinates: {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
      },
      confidence,
    };
  } catch (error) {
    console.error('[GoogleGeocoding] Error geocoding address:', error);
    return null;
  }
}

/**
 * Validate that geocoded coordinates match the expected location
 * This prevents issues like Florida addresses getting California coordinates
 */
export function validateGeocodedLocation(
  address: string,
  geocoded: GeocodedAddress
): { valid: boolean; reason?: string } {
  const addressLower = address.toLowerCase();
  
  // Extract state from address if present
  const stateMatch = address.match(/\b([A-Z]{2})\b/);
  const addressState = stateMatch ? stateMatch[1] : null;
  
  // Check if the geocoded state matches the address state
  if (addressState && geocoded.state && addressState !== geocoded.state) {
    return {
      valid: false,
      reason: `State mismatch: Address says ${addressState} but geocoded to ${geocoded.state}`
    };
  }
  
  // Check for city mismatch
  if (geocoded.city) {
    const cityInAddress = addressLower.includes(geocoded.city.toLowerCase());
    if (!cityInAddress && geocoded.confidence === 'high') {
      // Only flag as invalid if we have high confidence and city doesn't match
      console.warn(`[GoogleGeocoding] City mismatch warning: ${geocoded.city} not found in ${address}`);
    }
  }
  
  // Additional validation for US addresses
  if (geocoded.country === 'United States') {
    const { latitude, longitude } = geocoded.coordinates;
    
    // Basic bounds check for continental US
    if (latitude < 24 || latitude > 49 || longitude < -125 || longitude > -66) {
      return {
        valid: false,
        reason: 'Coordinates outside continental US bounds'
      };
    }
    
    // State-specific validation
    if (geocoded.state === 'FL') {
      if (latitude < 24 || latitude > 31 || longitude < -88 || longitude > -79) {
        return {
          valid: false,
          reason: 'Florida address has coordinates outside Florida'
        };
      }
    } else if (geocoded.state === 'CA') {
      if (latitude < 32 || latitude > 42 || longitude < -125 || longitude > -114) {
        return {
          valid: false,
          reason: 'California address has coordinates outside California'
        };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Enhanced geocoding with validation and fallback
 * Never returns fake/random coordinates
 */
export async function geocodeAddressEnhanced(address: string): Promise<GeocodedAddress | null> {
  // First try Google Maps API
  const geocoded = await geocodeWithGoogle(address);
  
  if (!geocoded) {
    console.error('[Geocoding] Failed to geocode address:', address);
    return null;
  }
  
  // Validate the result
  const validation = validateGeocodedLocation(address, geocoded);
  
  if (!validation.valid) {
    console.error('[Geocoding] Validation failed:', validation.reason);
    console.error('[Geocoding] Address:', address);
    console.error('[Geocoding] Geocoded result:', geocoded);
    return null;
  }
  
  console.log('[Geocoding] Successfully geocoded and validated:', {
    address,
    coordinates: geocoded.coordinates,
    confidence: geocoded.confidence
  });
  
  return geocoded;
}

/**
 * Fallback to existing geocoding service if Google Maps is not available
 * But with proper validation to prevent wrong coordinates
 */
export async function geocodeAddressWithFallback(address: string): Promise<GeocodedAddress | null> {
  // Try Google Maps first if API key is available
  if (GOOGLE_MAPS_API_KEY) {
    const result = await geocodeAddressEnhanced(address);
    if (result) return result;
  }
  
  // If Google Maps fails or no API key, try the existing service
  // But we'll validate the results properly
  try {
    // Import dynamically to avoid circular dependencies
    const { geocodeAddressCrossPlatform } = await import('./geocodingService');
    const result = await geocodeAddressCrossPlatform(address);
    
    if (result) {
      // Convert to our format and validate
      const geocoded: GeocodedAddress = {
        fullAddress: result.fullAddress,
        streetNumber: result.streetNumber,
        streetName: result.streetName,
        city: result.city,
        state: result.state,
        zipCode: result.zipCode,
        country: result.country || 'United States',
        coordinates: result.coordinates,
        confidence: 'low' // Mark as low confidence since it's a fallback
      };
      
      // Validate the result
      const validation = validateGeocodedLocation(address, geocoded);
      if (!validation.valid) {
        console.error('[Geocoding] Fallback validation failed:', validation.reason);
        return null;
      }
      
      return geocoded;
    }
  } catch (error) {
    console.error('[Geocoding] Fallback geocoding failed:', error);
  }
  
  return null;
}
