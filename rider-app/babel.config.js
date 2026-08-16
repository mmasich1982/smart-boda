// rider-app/babel.config.js
// AUDIT FIX (blocking): no babel config existed anywhere in this project at all. Expo's
// Metro bundler AND Jest (via jest-expo) both require this to transform JSX, Flow-typed
// React Native internals, and Expo's own modules -- without it the app cannot build for
// native or web, and no test file can run.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
