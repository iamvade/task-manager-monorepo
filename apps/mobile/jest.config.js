/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Router tests mount whole navigators; a cold transform cache makes the first one slow.
  testTimeout: 30000,
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  // pnpm: packages live under node_modules/.pnpm/<id>/node_modules/<name>; transpile the RN ones.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|lucide-react-native|react-native-svg))',
  ],
  moduleNameMapper: {
    // @kite/shared is TS source importing siblings as `./dates.js`.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // lucide's `react-native` export is an .mjs file, which jest-expo doesn't transform.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
};
