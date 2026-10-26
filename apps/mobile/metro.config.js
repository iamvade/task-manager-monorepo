// Expo configures the monorepo (watch folders, node_modules lookup) itself; see Expo's
// "Work with monorepos" guide. The only addition is resolving @kite/shared's TS source.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const sharedSrc = path.resolve(__dirname, '../../packages/shared/src') + path.sep;

// packages/shared is TypeScript imported from source; it names siblings `./dates.js` (Node ESM
// style for the API). Metro doesn't map `.js` to `.ts`, so retry those without the extension.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveRequest ?? context.resolveRequest;
  if (context.originModulePath.startsWith(sharedSrc) && /^\.{1,2}\/.*\.js$/.test(moduleName)) {
    return resolve(context, moduleName.slice(0, -'.js'.length), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
