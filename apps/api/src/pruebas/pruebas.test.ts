import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pruebasHabilitadas } from './habilitadas';

describe('endpoint de pruebas (spec pruebas-carga, D6)', () => {
  it('la configuración de producción no define PRUEBAS_HABILITADAS', () => {
    const texto = readFileSync(join(import.meta.dirname, '../../wrangler.jsonc'), 'utf8');
    expect(texto).not.toContain('PRUEBAS_HABILITADAS');
  });

  it('solo "true" habilita el módulo', () => {
    expect(pruebasHabilitadas('true')).toBe(true);
    for (const v of [undefined, '', 'false', 'TRUE', '1'])
      expect(pruebasHabilitadas(v)).toBe(false);
  });
});
