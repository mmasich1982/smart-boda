// Runs the pure-logic Smart Bizna tests without the Expo toolchain:
//   npx jest -c jest.business.config.js
// (the full app uses jest-expo; these tests import no React Native code)
module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/src/__tests__/business/**/*.test.js', '<rootDir>/src/__tests__/admin/**/*.test.js'],
  testEnvironment: 'node',
  moduleNameMapper: { '^react-native$': '<rootDir>/src/__tests__/business/mocks/react-native.js', '^@react-navigation/native$': '<rootDir>/src/__tests__/business/mocks/navigation-native.js',
    '^@react-navigation/native-stack$': '<rootDir>/src/__tests__/business/mocks/native-stack.js' },
  transform: { '\\.js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-react'], configFile: false, babelrc: false }] },
};
