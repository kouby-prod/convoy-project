// Metro config tuned for a pnpm monorepo.
// Watches the repo root so the workspace packages (@carpool/*) are bundled,
// and resolves modules from both the app and the hoisted root node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// Load env from the single root .env. Metro config runs before bundling, so the
// EXPO_PUBLIC_* values are present in process.env when Expo inlines them.
require('dotenv').config({ path: path.resolve(monorepoRoot, '.env') });

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
