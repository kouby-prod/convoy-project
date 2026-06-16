import base from '@carpool/config/eslint';

export default [
  ...base,
  {
    // Metro & Babel configs are CommonJS by contract (Expo loads them as CJS).
    ignores: ['.expo/**', 'expo-env.d.ts', 'metro.config.js', 'babel.config.js'],
  },
];
