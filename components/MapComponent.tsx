import React from 'react';
import { Platform } from 'react-native';

// Platform-specific imports handled conditionally
let MapView: any;
let Marker: any;
let Callout: any;
let Polygon: any;
let Polyline: any;
let Circle: any;

if (Platform.OS === 'web') {
  // Web implementation - no react-native-maps import
  const WebMap = require('./MapComponent.web').default;
  MapView = WebMap;
  Marker = require('./MapComponent.web').Marker;
  Callout = require('./MapComponent.web').Callout;
  Polygon = require('./MapComponent.web').Polygon;
  Polyline = require('./MapComponent.web').Polyline;
  Circle = require('./MapComponent.web').Circle;
} else {
  // Native implementation - only import on mobile
  const NativeMaps = require('react-native-maps');
  MapView = NativeMaps.default;
  Marker = NativeMaps.Marker;
  Callout = NativeMaps.Callout;
  Polygon = NativeMaps.Polygon;
  Polyline = NativeMaps.Polyline;
  Circle = NativeMaps.Circle;
}

export default MapView;
export { Marker, Callout, Polygon, Polyline, Circle };
