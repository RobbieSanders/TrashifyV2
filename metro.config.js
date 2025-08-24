const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add platform-specific module resolution
config.resolver.platforms = ['native', 'web', 'ios', 'android'];

// Exclude react-native-maps from web builds
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.alias = {
  ...(config.resolver.alias || {}),
};

// Platform-specific extensions
config.resolver.sourceExts = [...config.resolver.sourceExts, 'web.js', 'web.jsx', 'web.ts', 'web.tsx'];

module.exports = config;
