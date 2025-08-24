import React, { memo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';

function WebMap({
  initialRegion = { latitude: 27.9506, longitude: -82.4572, latitudeDelta: 0.05, longitudeDelta: 0.05 },
  markers = [],
  onPressMarker,
  style,
}) {
  const openInGoogleMaps = (lat, lng, title) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.mapPlaceholder}>
        <Text style={styles.title}>Map View (Web)</Text>
        <Text style={styles.subtitle}>
          Center: {initialRegion.latitude.toFixed(4)}, {initialRegion.longitude.toFixed(4)}
        </Text>
        
        {markers.length > 0 && (
          <View style={styles.markersContainer}>
            <Text style={styles.markersTitle}>Locations:</Text>
            {markers.map((marker, index) => (
              <TouchableOpacity
                key={marker.id || index}
                style={styles.markerItem}
                onPress={() => {
                  onPressMarker?.(marker);
                  openInGoogleMaps(marker.coordinate.latitude, marker.coordinate.longitude, marker.title);
                }}
              >
                <Text style={styles.markerTitle}>{marker.title || `Location ${index + 1}`}</Text>
                <Text style={styles.markerCoords}>
                  {marker.coordinate.latitude.toFixed(4)}, {marker.coordinate.longitude.toFixed(4)}
                </Text>
                {marker.description && (
                  <Text style={styles.markerDescription}>{marker.description}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        <TouchableOpacity
          style={styles.openMapsButton}
          onPress={() => openInGoogleMaps(initialRegion.latitude, initialRegion.longitude)}
        >
          <Text style={styles.buttonText}>Open in Google Maps</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 240,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8F9FA',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  mapPlaceholder: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  markersContainer: {
    width: '100%',
    marginBottom: 16,
  },
  markersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  markerItem: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  markerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  markerCoords: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  markerDescription: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 4,
  },
  openMapsButton: {
    backgroundColor: '#1E88E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default memo(WebMap);
