// Note: Web-first re-export to ensure Metro never traverses native-only modules when bundling for web.
// App screens should import './components/Map' (which resolves to Map.tsx) rather than this file directly.
export { default } from './Map.web';
export type { MapProps, MapMarker } from './Map.web';
