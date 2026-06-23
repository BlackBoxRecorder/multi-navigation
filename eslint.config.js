import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        AMap: 'readonly',
        // Vite define 注入的编译时常量
        __AMAP_KEY__: 'readonly',
        __AMAP_SECURITY_CODE__: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },
  // Node.js globals for config files (vite.config.js etc.)
  {
    files: ['*.config.js', '*.config.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslintConfigPrettier,
];
