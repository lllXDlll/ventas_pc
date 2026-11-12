// Funciones puras del asistente (tarea 1.5 del Sprint 5): preselección, validación,
// armador determinístico y plantillas, con el catálogo de ejemplo y las reglas por defecto.
import { describe, expect, it } from 'vitest';
import { CATALOGO_EJEMPLO } from '../../scripts/semillas';
import type { CategoriaPieza } from '../compatibilidad/motor/tipos';
import { armar, MAX_NODOS, minimo } from './armador-deterministico';
import { validarRecomendacion } from './esquema';
import { preseleccionar } from './preseleccion';
import { aCentimos, CATEGORIAS_ARMADO, type ProductoAsistente, USOS } from './tipos';
import { motivosDe, totalCent } from './validacion';

const REGLAS = [] as const; // sin filas: todas activas con sus parámetros por defecto

const catalogo: ProductoAsistente[] = CATALOGO_EJEMPLO.filter(
  (p) => p.categoria !== 'EQUIPO_ARMADO',
).map((p) => ({
  id: p.id,
  nombre: p.nombre,
  marca: p.marca,
  categoria: p.categoria as CategoriaPieza,
  precioCent: aCentimos(p.precio),
  atributos: p.atributos,
  disponible: p.stock,
}));

const cuota = (items: { producto: ProductoAsistente }[], c: CategoriaPieza) =>
  items.filter((i) => i.producto.categoria === c).reduce((s, i) => s + i.producto.precioCent, 0) /
  totalCent(items.map((i) => ({ ...i, cantidad: 1 })));

describe('preselección', () => {
  const candidatos = preseleccionar(catalogo, aCentimos(5000), 'GAMING');

  it('cubre todas las categorías, con alias C1… y a lo sumo 5 por categoría', () => {
    for (const c of CATEGORIAS_ARMADO) {
      const n = candidatos.filter((x) => x.producto.categoria === c).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(candidatos.map((c) => c.alias)).toEqual(candidatos.map((_, i) => `C${i + 1}`));
  });

  it('incluye siempre el más barato y nunca un producto sin disponible', () => {
    const sinStock = catalogo.filter((p) => p.disponible === 0).map((p) => p.id);
    expect(candidatos.some((c) => sinStock.includes(c.producto.id))).toBe(false);
    for (const c of CATEGORIAS_ARMADO) {
      const conStock = catalogo.filter((p) => p.categoria === c && p.disponible > 0);
      const barato = conStock.sort((a, b) => a.precioCent - b.precioCent)[0]!;
      expect(candidatos.some((x) => x.producto.id === barato.id)).toBe(true);
    }
  });
});

describe('armador determinístico', () => {
  for (const uso of USOS) {
    it(`${uso}: completa, compatible y dentro del presupuesto`, () => {
      const presupuesto = aCentimos(6000);
      const r = armar(catalogo, presupuesto, uso, REGLAS);
      expect(r).not.toBeNull();
      expect(motivosDe(r!.items, presupuesto, REGLAS)).toEqual([]);
      expect(r!.items.every((i) => i.explicacion.length > 0 && i.explicacion.length <= 300)).toBe(
        true,
      );
    });
  }

  it('gaming dedica a la tarjeta gráfica más que oficina con el mismo presupuesto', () => {
    const p = aCentimos(6000);
    const gaming = armar(catalogo, p, 'GAMING', REGLAS)!.items;
    const oficina = armar(catalogo, p, 'OFICINA', REGLAS)!.items;
    expect(cuota(gaming, 'TARJETA_GRAFICA')).toBeGreaterThan(cuota(oficina, 'TARJETA_GRAFICA'));
  });

  it('el mínimo es alcanzable y un presupuesto menor no tiene solución', () => {
    const m = minimo(catalogo, REGLAS)!;
    expect(m).toBeGreaterThan(0);
    expect(armar(catalogo, m, 'OFICINA', REGLAS)).not.toBeNull();
    expect(armar(catalogo, m - 1, 'OFICINA', REGLAS)).toBeNull();
    expect(armar(catalogo, aCentimos(300), 'GAMING', REGLAS)).toBeNull();
  });

  it('con un catálogo grande la búsqueda queda acotada en nodos y tiempo', () => {
    // 12 variantes por producto (~220 componentes), con precios distintos.
    const grande = catalogo.flatMap((p) =>
      Array.from({ length: 12 }, (_, k) => ({
        ...p,
        id: `${p.id}-${k}`,
        precioCent: p.precioCent + k * 1000,
      })),
    );
    const t = performance.now();
    const r = armar(grande, aCentimos(9000), 'DISENO', REGLAS);
    const ms = performance.now() - t;
    expect(r).not.toBeNull();
    expect(r!.nodos).toBeLessThanOrEqual(MAX_NODOS);
    expect(ms).toBeLessThan(50); // en Node; en workerd se mide con la consulta real (tarea 5.4)
  });
});

describe('validación de la respuesta del modelo', () => {
  const presupuesto = aCentimos(6000);
  const candidatos = preseleccionar(catalogo, presupuesto, 'GAMING');
  const buena = armar(
    candidatos.map((c) => c.producto),
    presupuesto,
    'GAMING',
    REGLAS,
  )!.items;
  const alias = (id: string) => candidatos.find((c) => c.producto.id === id)!.alias;
  const respuesta = (items = buena) => ({
    componentes: items.map((i) => ({
      alias: alias(i.producto.id),
      cantidad: 1,
      explicacion: 'Bien elegido.',
    })),
    resumen: 'Ok',
  });

  it('una respuesta correcta es válida', () => {
    const v = validarRecomendacion(respuesta(), candidatos, presupuesto, REGLAS);
    expect(v.motivos).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.items.every((i) => i.explicacion === 'Bien elegido.')).toBe(true);
  });

  it('formato inválido: sin explicación', () => {
    const r = respuesta();
    delete (r.componentes[0] as { explicacion?: string }).explicacion;
    const v = validarRecomendacion(r, candidatos, presupuesto, REGLAS);
    expect(v.ok).toBe(false);
    expect(v.motivos[0]).toMatch(/formato/);
  });

  it('alias desconocido', () => {
    const r = respuesta();
    r.componentes[0]!.alias = 'C999';
    expect(validarRecomendacion(r, candidatos, presupuesto, REGLAS).motivos.join(' ')).toMatch(
      /C999 no está/,
    );
  });

  it('falta una categoría o hay dos placas', () => {
    const sinFuente = buena.filter((i) => i.producto.categoria !== 'FUENTE');
    const r = {
      componentes: [...respuesta(sinFuente).componentes, respuesta(sinFuente).componentes[0]!],
      resumen: '',
    };
    const motivos = validarRecomendacion(r, candidatos, presupuesto, REGLAS).motivos.join(' ');
    expect(motivos).toMatch(/Falta fuente/);
  });

  it('cantidad mayor que el disponible', () => {
    const ram = buena.find((i) => i.producto.categoria === 'RAM')!;
    const r = respuesta();
    const fila = r.componentes.find((c) => c.alias === alias(ram.producto.id))!;
    fila.cantidad = ram.producto.disponible + 1 > 4 ? 4 : ram.producto.disponible + 1;
    const conPoco = candidatos.map((c) =>
      c.producto.id === ram.producto.id ? { ...c, producto: { ...c.producto, disponible: 1 } } : c,
    );
    fila.cantidad = 2;
    expect(validarRecomendacion(r, conPoco, presupuesto, REGLAS).motivos.join(' ')).toMatch(
      /quedan 1/,
    );
  });

  it('total sobre el presupuesto', () => {
    const v = validarRecomendacion(respuesta(), candidatos, aCentimos(500), REGLAS);
    expect(v.motivos.join(' ')).toMatch(/supera el presupuesto/);
  });

  it('rechazo del motor: placa de otro socket', () => {
    const cpu = buena.find((i) => i.producto.categoria === 'PROCESADOR')!.producto;
    const otraPlaca = candidatos.find(
      (c) =>
        c.producto.categoria === 'PLACA_MADRE' &&
        c.producto.atributos.socket !== cpu.atributos.socket,
    );
    expect(otraPlaca).toBeDefined();
    const r = respuesta();
    const fila = r.componentes.find(
      (c) => candidatos.find((x) => x.alias === c.alias)!.producto.categoria === 'PLACA_MADRE',
    )!;
    fila.alias = otraPlaca!.alias;
    const v = validarRecomendacion(r, candidatos, aCentimos(100000), REGLAS);
    expect(v.ok).toBe(false);
    expect(v.motivos.join(' ')).toMatch(/socket/i);
  });
});
