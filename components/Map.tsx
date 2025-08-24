// Web-only re-export. On native, the import path './components/Map' should be avoided
// and native code should import './components/Map.native'. In our App.tsx we use
// dynamic require to ensure native does not import this file.
export { default } from './Map.web';
