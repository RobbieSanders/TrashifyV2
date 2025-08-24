const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);
  
  // Alias react-native-maps to a web-safe component on web
  config.resolve.alias = {
    ...config.resolve.alias,
    'react-native-maps': './components/Map.web.js',
    './components/Map.native': './components/Map.web.js',
  };
  
  return config;
};
