declare module './components/Map' {
  import type MapView from 'react-native-maps';
  // Export default MapView component and Marker for typing convenience
  export default MapView;
  export const Marker: any;
}
