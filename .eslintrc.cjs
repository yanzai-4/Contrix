// Shared ESLint baseline for the monorepo.
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  // Keep ignore list aligned with .eslintignore for predictable editor/CLI behavior.
  ignorePatterns: ['dist', 'build', 'node_modules', 'apps/desktop/src-tauri/target'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'react-refresh/only-export-components': 'off'
  }
};
