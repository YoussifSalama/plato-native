import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.profile'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // the extension must never gain these
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  { files: ['scripts/**', 'test/runtime/**', 'eslint.config.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', setTimeout: 'readonly', chrome: 'readonly', document: 'readonly' } } },
);
