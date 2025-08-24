import React, { memo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
// Use our unified MapComponent instead of direct react-native-maps import
import MapView, { Marker } from './MapComponent';
const PROVIDER_DEFAULT = undefined; // Not needed with our component

export type MapMarker = {
  id?: string;
  title?: string;
  description?: string;
  coordinate: { latitude: number; longitude: number };
};

export type MapProps = {
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  markers?: MapMarker[];
  showsUserLocation?: boolean;
  onRegionChangeComplete?: (region: any) => void;
  onPressMarker?: (m: MapMarker) => void;
  style?: any;
  disableOnWeb?: boolean;
  webPlaceholder?: React.ReactNode;
};

const DEFAULT_REGION = {
  latitude: 27.9506,
  longitude: -82.4572,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function NativeMap({
  initialRegion = DEFAULT_REGION,
  markers = [],
  showsUserLocation = false,
  onRegionChangeComplete,
  onPressMarker,
  style,
}: MapProps) {
  return (
    <View style={[styles.container, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT} // Uses Apple Maps on iOS, Google Maps on Android
        initialRegion={initialRegion}
        showsUserLocation={showsUserLocation}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {markers.map((m) => (
          <Marker
            key={m.id || `${m.coordinate.latitude},${m.coordinate.longitude}`}
            coordinate={m.coordinate}
            title={m.title}
            description={m.description}
            onPress={() => onPressMarker && onPressMarker(m)}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 240,
    borderRadius: 12,
    overflow: 'hidden',
  },
});

export default memo(NativeMap);
