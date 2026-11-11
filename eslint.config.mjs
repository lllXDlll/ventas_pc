// Configuración compartida de ESLint (flat config) para todo el monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/worker-configuration.d.ts',
      'apps/api/src/generated/**',
      'docs/**',
      'openspec/**',
      '.agents/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Scripts y configuraciones que corren en Node.
    files: ['**/*.mjs', '**/*.config.ts', '**/scripts/**'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
