// Expo's default config already understands npm workspaces (the shared package lives in ../../packages).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
