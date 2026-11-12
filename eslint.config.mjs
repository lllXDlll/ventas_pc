// Configuración compartida de ESLint (flat config) para todo el monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const WEB = 'apps/web/src';
const FUNCIONALIDADES = ['catalogo', 'auth', 'admin', 'armador'];
const sinSubir = {
  // Dentro de una funcionalidad o de components/ se admite ../ (misma capa); salir de ella
  // con ../../ no, para que la regla de capas no se pueda saltar.
  group: ['../../*', '../../**'],
  message: 'Usa el alias @/ para importar desde otra capa o funcionalidad (regla de capas).',
};
const prohibir = (grupos, mensaje) => ({ group: grupos, message: mensaje });

/**
 * Un bloque por carpeta. En flat config un bloque posterior reemplaza la regla completa
 * de uno anterior, así que cada bloque lista todas sus restricciones.
 */
function capasFrontend() {
  const bloque = (files, patterns) => ({
    files,
    rules: { 'no-restricted-imports': ['error', { patterns: [sinSubir, ...patterns] }] },
  });
  const noApp = prohibir(['@/app', '@/app/**'], 'Ninguna capa importa de app/ (solo compone).');
  const noFeatures = prohibir(
    ['@/features', '@/features/**'],
    'components/ y lib/ no importan de features/: reciben los datos por props.',
  );
  const noComponents = prohibir(['@/components/**'], 'lib/ no importa componentes.');
  const sinDatos = prohibir(
    ['@/lib/api-client', '@tanstack/react-query', '@/features/*/hooks/**', '../hooks/**'],
    'Los componentes de presentación no leen datos: los reciben por props desde un contenedor.',
  );
  const otras = (f) =>
    prohibir(
      FUNCIONALIDADES.filter((o) => o !== f).flatMap((o) => [
        `@/features/${o}`,
        `@/features/${o}/**`,
      ]),
      `features/${f} no importa de otra funcionalidad: lo compartido va en components/ o lib/.`,
    );
  return [
    bloque([`${WEB}/**/*.{ts,tsx}`], []),
    bloque(
      [`${WEB}/app/**/*.{ts,tsx}`],
      [prohibir(['@/lib/api-client'], 'Las rutas usan los api.ts y hooks de cada funcionalidad.')],
    ),
    bloque([`${WEB}/components/**/*.{ts,tsx}`], [noApp, noFeatures, sinDatos]),
    bloque([`${WEB}/lib/**/*.{ts,tsx}`], [noApp, noFeatures, noComponents]),
    ...FUNCIONALIDADES.flatMap((f) => [
      bloque([`${WEB}/features/${f}/**/*.{ts,tsx}`], [noApp, otras(f)]),
      bloque([`${WEB}/features/${f}/components/**/*.{ts,tsx}`], [noApp, otras(f), sinDatos]),
    ]),
  ];
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/.wrangler/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
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
    // Prisma agrupa los findUnique simultáneos en una sola consulta: con un PrismaClient por
    // isolate, juntaba peticiones distintas sobre la conexión de una sola, y workerd
    // cancelaba las demás ("code had hung"). Se usa findFirst (Sprint 3).
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^findUnique(OrThrow)?$/]',
          message: 'Usa findFirst: findUnique se agrupa entre peticiones y cuelga el Worker.',
        },
      ],
    },
  },
  // Capas del frontend (spec arquitectura-frontend, design D2 del Sprint 1.5):
  // app -> features -> components -> lib. Cada capa solo importa de las de abajo.
  ...capasFrontend(),
  {
    // Scripts y configuraciones que corren en Node.
    files: ['**/*.mjs', '**/*.config.ts', '**/scripts/**'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
