import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';

interface MapComponentProps {
  style?: any;
  children?: React.ReactNode;
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  region?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onRegionChange?: (region: any) => void;
  onRegionChangeComplete?: (region: any) => void;
  showsUserLocation?: boolean;
  followsUserLocation?: boolean;
}

// Web Google Maps component with proper API integration
const MapComponent = forwardRef<any, MapComponentProps>(({ 
  style,
  children,
  initialRegion,
  region,
  showsUserLocation,
  onRegionChangeComplete
}, ref) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);

  const displayRegion = region || initialRegion || {
    latitude: 39.8283,
    longitude: -98.5795,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

  useImperativeHandle(ref, () => ({
    animateToRegion: (newRegion: any, duration?: number) => {
      if (googleMapRef.current) {
        console.log('[MapComponent] Animating to region:', newRegion);
        googleMapRef.current.panTo({
          lat: newRegion.latitude,
          lng: newRegion.longitude
        });
        
        // Calculate zoom level based on latitudeDelta
        const zoom = Math.round(Math.log(360 / newRegion.latitudeDelta) / Math.LN2);
        googleMapRef.current.setZoom(Math.max(1, Math.min(20, zoom)));
      }
    }
  }));

  useEffect(() => {
    // Load Google Maps API
    if (typeof window !== 'undefined' && !window.google) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyAWNokcvJOMRSKbdlJ8Nrlu-7njcKUf-XY&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = initializeMap;
      document.head.appendChild(script);
    } else if (window.google) {
      initializeMap();
    }
  }, []);

  useEffect(() => {
    if (googleMapRef.current && region) {
      console.log('[MapComponent] Updating map region to:', region);
      googleMapRef.current.setCenter({
        lat: region.latitude,
        lng: region.longitude
      });
      
      // Calculate zoom level based on latitudeDelta
      const zoom = Math.round(Math.log(360 / region.latitudeDelta) / Math.LN2);
      googleMapRef.current.setZoom(Math.max(1, Math.min(20, zoom)));
    }
  }, [region]);

  useEffect(() => {
    // Update markers and polylines when children change
    if (googleMapRef.current && children) {
      // Clear existing markers and polylines
      markersRef.current.forEach(marker => marker.setMap(null));
      polylinesRef.current.forEach(polyline => polyline.setMap(null));
      markersRef.current = [];
      polylinesRef.current = [];
      
      // Process children to add markers and polylines
      React.Children.forEach(children, (child: any) => {
        if (!child || !child.props) return;
        
        if (child.type?.displayName === 'Marker' && child.props.coordinate) {
          console.log('[MapComponent] Adding marker at:', child.props.coordinate);
          const marker = new window.google.maps.Marker({
            position: {
              lat: child.props.coordinate.latitude,
              lng: child.props.coordinate.longitude
            },
            map: googleMapRef.current,
            title: child.props.title || 'Location',
            icon: child.props.pinColor ? {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: child.props.pinColor,
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
              scale: 8
            } : undefined
          });
          markersRef.current.push(marker);
        }
        
        if (child.type?.displayName === 'Polyline' && child.props.coordinates) {
          console.log('[MapComponent] Adding polyline with coordinates:', child.props.coordinates);
          const polyline = new window.google.maps.Polyline({
            path: child.props.coordinates.map((coord: any) => ({
              lat: coord.latitude,
              lng: coord.longitude
            })),
            geodesic: true,
            strokeColor: child.props.strokeColor || '#1E88E5',
            strokeOpacity: 1.0,
            strokeWeight: child.props.strokeWidth || 2
          });
          polyline.setMap(googleMapRef.current);
          polylinesRef.current.push(polyline);
        }
      });
    }
  }, [children]);

  const initializeMap = () => {
    if (mapRef.current && window.google) {
      console.log('[MapComponent] Initializing map with region:', displayRegion);
      
      const map = new window.google.maps.Map(mapRef.current, {
        center: {
          lat: displayRegion.latitude,
          lng: displayRegion.longitude
        },
        zoom: 13,
        mapTypeId: 'roadmap',
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      });

      googleMapRef.current = map;

      // Add event listener for region changes
      if (onRegionChangeComplete) {
        map.addListener('idle', () => {
          const center = map.getCenter();
          const bounds = map.getBounds();
          if (center && bounds) {
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            const newRegion = {
              latitude: center.lat(),
              longitude: center.lng(),
              latitudeDelta: ne.lat() - sw.lat(),
              longitudeDelta: ne.lng() - sw.lng()
            };
            onRegionChangeComplete(newRegion);
          }
        });
      }

      // Add user location if requested
      if (showsUserLocation && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          new window.google.maps.Marker({
            position: userLocation,
            map: map,
            title: 'Your Location',
            icon: {
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="8" fill="#4285F4" stroke="white" stroke-width="2"/>
                  <circle cx="10" cy="10" r="3" fill="white"/>
                </svg>
              `),
              scaledSize: new window.google.maps.Size(20, 20)
            }
          });
        });
      }
    }
  };

  return (
    <View style={[styles.container, style]}>
      <div 
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: 200,
          borderRadius: 8,
          overflow: 'hidden'
        }} 
      />
    </View>
  );
});

MapComponent.displayName = 'MapComponent';

// Export Marker and other components for web
export const Marker: React.FC<any> = ({ children, ...props }) => {
  // Store props for the map to use, but don't render anything
  return null;
};

Marker.displayName = 'Marker';

export const Callout: React.FC<any> = ({ children }) => <>{children}</>;

export const Polygon: React.FC<any> = () => null;

export const Polyline: React.FC<any> = ({ coordinates, strokeColor, strokeWidth }) => {
  // This component will be processed by the map
  return null;
};

Polyline.displayName = 'Polyline';

export const Circle: React.FC<any> = () => null;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});

export default MapComponent;
