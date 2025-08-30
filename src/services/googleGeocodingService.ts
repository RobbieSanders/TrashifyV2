import { Coordinates } from '../utils/types';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAWNokcvJOMRSKbdlJ8Nrlu-7njcKUf-XY';

export interface GoogleGeocodingResult {
  fullAddress: string;
  coordinates: Coordinates;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

// Geocode an address using Google Maps API
export async function geocodeAddressGoogle(address: string): Promise<GoogleGeocodingResult | null> {
  try {
    console.log('[GoogleGeocoding] Geocoding address:', address);
    
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.warn('[GoogleGeocoding] No results found for address:', address, 'Status:', data.status);
      return null;
    }
    
    const result = data.results[0];
    const location = result.geometry.location;
    
    // Extract address components
    let city = '';
    let state = '';
    let zipCode = '';
    let country = '';
    
    if (result.address_components) {
      for (const component of result.address_components) {
        const types = component.types;
        
        if (types.includes('locality')) {
          city = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          state = component.short_name;
        } else if (types.includes('postal_code')) {
          zipCode = component.long_name;
        } else if (types.includes('country')) {
          country = component.long_name;
        }
      }
    }
    
    const geocodingResult: GoogleGeocodingResult = {
      fullAddress: result.formatted_address,
      coordinates: {
        latitude: location.lat,
        longitude: location.lng
      },
      city,
      state,
      zipCode,
      country
    };
    
    console.log('[GoogleGeocoding] Successfully geocoded:', geocodingResult);
    return geocodingResult;
    
  } catch (error) {
    console.error('[GoogleGeocoding] Error geocoding address:', error);
    return null;
  }
}

// Calculate distance between two coordinates using Google Maps Distance Matrix API
export async function calculateDistanceGoogle(
  origin: Coordinates,
  destination: Coordinates
): Promise<number | null> {
  try {
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destinationStr = `${destination.latitude},${destination.longitude}`;
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originStr}&destinations=${destinationStr}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.rows || data.rows.length === 0) {
      console.warn('[GoogleGeocoding] Distance Matrix API error:', data.status);
      return null;
    }
    
    const element = data.rows[0].elements[0];
    if (element.status !== 'OK') {
      console.warn('[GoogleGeocoding] Distance calculation failed:', element.status);
      return null;
    }
    
    // Extract distance in miles
    const distanceText = element.distance.text;
    const distanceValue = element.distance.value; // in meters
    const distanceInMiles = distanceValue * 0.000621371; // Convert meters to miles
    
    console.log(`[GoogleGeocoding] Distance: ${distanceInMiles.toFixed(2)} miles (${distanceText})`);
    return distanceInMiles;
    
  } catch (error) {
    console.error('[GoogleGeocoding] Error calculating distance:', error);
    return null;
  }
}

// Check if a property is within a cleaner's service radius using Google Maps
export async function isPropertyWithinRadiusGoogle(
  propertyAddress: string,
  cleanerCoordinates: Coordinates,
  radiusMiles: number
): Promise<boolean> {
  try {
    console.log(`[GoogleGeocoding] Checking if property "${propertyAddress}" is within ${radiusMiles} miles of cleaner at ${cleanerCoordinates.latitude}, ${cleanerCoordinates.longitude}`);
    
    // Validate cleaner coordinates
    if (!cleanerCoordinates || 
        typeof cleanerCoordinates.latitude !== 'number' || 
        typeof cleanerCoordinates.longitude !== 'number' ||
        isNaN(cleanerCoordinates.latitude) || 
        isNaN(cleanerCoordinates.longitude)) {
      console.error('[GoogleGeocoding] Invalid cleaner coordinates:', cleanerCoordinates);
      return false;
    }
    
    // Validate radius
    if (!radiusMiles || typeof radiusMiles !== 'number' || radiusMiles <= 0) {
      console.error('[GoogleGeocoding] Invalid radius:', radiusMiles);
      return false;
    }
    
    // First geocode the property address
    const propertyGeocode = await geocodeAddressGoogle(propertyAddress);
    if (!propertyGeocode) {
      console.warn('[GoogleGeocoding] Could not geocode property address:', propertyAddress);
      return false; // If we can't geocode, don't show the bid
    }
    
    console.log(`[GoogleGeocoding] Property geocoded to: ${propertyGeocode.coordinates.latitude}, ${propertyGeocode.coordinates.longitude}`);
    
    // Calculate distance using Google Maps Distance Matrix API
    const distance = await calculateDistanceGoogle(cleanerCoordinates, propertyGeocode.coordinates);
    if (distance === null) {
      console.warn('[GoogleGeocoding] Could not calculate distance to property, falling back to haversine formula');
      // Fallback to haversine formula if Google Distance Matrix fails
      const fallbackDistance = calculateHaversineDistance(cleanerCoordinates, propertyGeocode.coordinates);
      const withinRadius = fallbackDistance <= radiusMiles;
      console.log(`[GoogleGeocoding] Fallback distance: ${fallbackDistance.toFixed(2)} miles. Within ${radiusMiles} mile radius: ${withinRadius}`);
      return withinRadius;
    }
    
    const withinRadius = distance <= radiusMiles;
    console.log(`[GoogleGeocoding] Property ${propertyAddress} is ${distance.toFixed(2)} miles away. Within ${radiusMiles} mile radius: ${withinRadius}`);
    
    return withinRadius;
    
  } catch (error) {
    console.error('[GoogleGeocoding] Error checking property distance:', error);
    return false;
  }
}

// Haversine formula for calculating distance between two coordinates (fallback)
function calculateHaversineDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Geocode with fallback - try Google first, then fall back to existing service
export async function geocodeAddressWithFallback(address: string): Promise<GoogleGeocodingResult | null> {
  // Try Google Maps first
  const googleResult = await geocodeAddressGoogle(address);
  if (googleResult) {
    return googleResult;
  }
  
  // Fallback to existing geocoding service
  try {
    const { geocodeAddressCrossPlatform } = await import('./geocodingService');
    const fallbackResult = await geocodeAddressCrossPlatform(address);
    
    if (fallbackResult) {
      return {
        fullAddress: fallbackResult.fullAddress,
        coordinates: fallbackResult.coordinates,
        city: fallbackResult.city,
        state: fallbackResult.state,
        zipCode: fallbackResult.zipCode,
        country: fallbackResult.country
      };
    }
  } catch (error) {
    console.error('[GoogleGeocoding] Fallback geocoding failed:', error);
  }
  
  return null;
}
