import { DurableObject } from 'cloudflare:workers';

/**
 * Contador de límite de peticiones (spec limite-peticiones, design.md D5 del Sprint 1).
 *
 * Un objeto por clave (`idFromName('registro:ip:…')`, `login:correo:…`, `login:ip:…`):
 * cada objeto atiende sus peticiones de una en una y cada método hace su lectura y su
 * escritura sin `await` entre ellas, así que contar es atómico entre todas las
 * instancias del Worker. Separado de Inventario para no cargar al objeto de reservas.
 *
 * Ventana fija: empieza en el primer intento contado y dura `ventanaMs`. Cada intento
 * contado escribe 1 fila (la del contador), que suma en la cuota diaria de Durable Objects.
 */

export interface Decision {
  permitido: boolean;
  /** Segundos hasta que vence la ventana actual (0 si está permitido). */
  reintentarEnS: number;
}

interface Contador {
  inicio: number;
  cuenta: number;
}

function validar(max: number | null, ventanaMs: number): void {
  if (max !== null && (!Number.isInteger(max) || max < 1)) {
    throw new RangeError(`max inválido: ${max}`);
  }
  if (!Number.isFinite(ventanaMs) || ventanaMs <= 0) {
    throw new RangeError(`ventanaMs inválida: ${ventanaMs}`);
  }
}

export class Limites extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Una sola fila por objeto. WITHOUT ROWID: cada escritura es una sola fila.
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS contador (
        id     INTEGER PRIMARY KEY CHECK (id = 1),
        inicio INTEGER NOT NULL,
        cuenta INTEGER NOT NULL CHECK (cuenta >= 0)
      ) WITHOUT ROWID;
    `);
  }

  async ping(): Promise<'ok'> {
    return 'ok';
  }

  /** Contador vigente, o null si no hay o si su ventana ya venció. */
  private vigente(ventanaMs: number, ahora: number): Contador | null {
    const fila = this.sql
      .exec<{ inicio: number; cuenta: number }>('SELECT inicio, cuenta FROM contador WHERE id = 1')
      .toArray()[0];
    if (!fila || ahora >= fila.inicio + ventanaMs) return null;
    return fila;
  }

  private guardar(contador: Contador): void {
    this.sql.exec(
      `INSERT INTO contador (id, inicio, cuenta) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET inicio = excluded.inicio, cuenta = excluded.cuenta`,
      contador.inicio,
      contador.cuenta,
    );
  }

  private decision(
    contador: Contador | null,
    max: number,
    ventanaMs: number,
    ahora: number,
  ): Decision {
    if (!contador || contador.cuenta < max) return { permitido: true, reintentarEnS: 0 };
    return {
      permitido: false,
      reintentarEnS: Math.max(1, Math.ceil((contador.inicio + ventanaMs - ahora) / 1000)),
    };
  }

  /** Comprueba y, si está permitido, cuenta el intento (en un solo paso). */
  async consumir(max: number, ventanaMs: number, ahora: number = Date.now()): Promise<Decision> {
    validar(max, ventanaMs);
    const actual = this.vigente(ventanaMs, ahora);
    const decision = this.decision(actual, max, ventanaMs, ahora);
    if (decision.permitido) {
      this.guardar(
        actual ? { ...actual, cuenta: actual.cuenta + 1 } : { inicio: ahora, cuenta: 1 },
      );
    }
    return decision;
  }

  /** Comprueba sin contar (límite por correo, antes de verificar la contraseña). */
  async consultar(max: number, ventanaMs: number, ahora: number = Date.now()): Promise<Decision> {
    validar(max, ventanaMs);
    return this.decision(this.vigente(ventanaMs, ahora), max, ventanaMs, ahora);
  }

  /** Cuenta un intento fallido (abre una ventana nueva si no hay una vigente). */
  async registrarFallo(ventanaMs: number, ahora: number = Date.now()): Promise<void> {
    validar(null, ventanaMs);
    const actual = this.vigente(ventanaMs, ahora);
    this.guardar(actual ? { ...actual, cuenta: actual.cuenta + 1 } : { inicio: ahora, cuenta: 1 });
  }

  /** Borra el contador (inicio de sesión correcto). */
  async reiniciar(): Promise<void> {
    this.sql.exec('DELETE FROM contador');
  }
}
