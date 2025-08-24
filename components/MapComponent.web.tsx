import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';

interface Location {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
}

interface MapComponentProps {
  locations?: Location[];
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

// Web-safe Map component that doesn't use react-native-maps
const MapComponent: React.FC<MapComponentProps> = ({ 
  locations = [], 
  style,
  children,
  initialRegion,
  region,
  showsUserLocation
}) => {
  const openInGoogleMaps = (lat: number, lng: number, title?: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  const displayRegion = region || initialRegion;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Map View (Web)</Text>
        {displayRegion && (
          <Text style={styles.subHeader}>
            Center: {displayRegion.latitude.toFixed(4)}, {displayRegion.longitude.toFixed(4)}
          </Text>
        )}
        {showsUserLocation && (
          <Text style={styles.locationIndicator}>📍 Location tracking enabled</Text>
        )}
      </View>
      
      <ScrollView style={styles.scrollView}>
        {locations.length > 0 ? (
          locations.map((location) => (
            <TouchableOpacity
              key={location.id}
              style={styles.locationItem}
              onPress={() => openInGoogleMaps(location.latitude, location.longitude, location.title)}
            >
              <View style={styles.locationContent}>
                <Text style={styles.locationTitle}>
                  {location.title || `Location ${location.id}`}
                </Text>
                {location.description && (
                  <Text style={styles.locationDescription}>{location.description}</Text>
                )}
                <Text style={styles.coordinates}>
                  📍 {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </Text>
              </View>
              <Text style={styles.openButton}>Open →</Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No locations to display</Text>
            <Text style={styles.emptySubtext}>
              Map functionality is limited on web. Use the mobile app for full features.
            </Text>
          </View>
        )}
      </ScrollView>
      
      {children}
    </View>
  );
};

// Export Marker and other components as no-ops for web
export const Marker: React.FC<any> = ({ children }) => <>{children}</>;
export const Callout: React.FC<any> = ({ children }) => <>{children}</>;
export const Polygon: React.FC<any> = () => null;
export const Polyline: React.FC<any> = () => null;
export const Circle: React.FC<any> = () => null;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#4A90E2',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subHeader: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.9,
  },
  locationIndicator: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  locationItem: {
    backgroundColor: 'white',
    padding: 15,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  locationContent: {
    flex: 1,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  locationDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  coordinates: {
    fontSize: 12,
    color: '#999',
  },
  openButton: {
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

export default MapComponent;
