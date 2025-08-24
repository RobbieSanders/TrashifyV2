// Keep this file extremely small and web-only to avoid Metro including native map modules on web.
// On native, the platform-specific files MapProxy.ios.tsx / MapProxy.android.tsx / MapProxy.native.tsx
// will be preferred by the bundler; this file will only be used on web as a generic fallback.
const mod = require('./MapProxy.web');
export const Marker = mod.Marker;
export default mod.default;
