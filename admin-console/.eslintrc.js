// admin-console/.eslintrc.cjs
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  rules: {
    'react/prop-types': 'off', // not adopted in this codebase; consider enabling incrementally
    'react/react-in-jsx-scope': 'off', // React 18 automatic JSX runtime
    'react/no-unescaped-entities': 'off', // ordinary apostrophes in copy are not a real bug
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};