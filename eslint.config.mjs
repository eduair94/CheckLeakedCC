import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'lib/**', 'node_modules/**', 'e2e/**', '*.mjs', '*.config.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The SDK intentionally uses `any` + index signatures for loose,
      // forward-compatible response typing.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
