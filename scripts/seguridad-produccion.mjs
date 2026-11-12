// Revisión de seguridad contra producción (Sprint 6, design D8). Solo hace peticiones a la
// API y al frontend propios (xdtech.store), sin servicios de terceros.
//
// Uso: node scripts/seguridad-produccion.mjs [--limite-ip]
//   DIRECT_URL (opcional, cargada con Read-Host): cuenta las sesiones vencidas en Neon.
//   --limite-ip: 51 inicios de sesión fallidos con X-Forwarded-For distinto en cada uno; el
//     último debe recibir 429. Bloquea el inicio de sesión desde esta IP durante 15 minutos.
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const API = process.env.API_URL ?? 'https://api.xdtech.store';
const WEB = process.env.WEB_URL ?? 'https://xdtech.store';
const ORIGEN_AJENO = 'https://ejemplo.invalid';
const json = { 'content-type': 'application/json', origin: WEB };

let ok = true;
const afirmar = (condicion, mensaje) => {
  console.log(`${condicion ? '✓' : '✗'} ${mensaje}`);
  ok &&= condicion;
};

// 1. Cookie de sesión de una cuenta desechable.
const correo = `seguridad-${randomUUID().slice(0, 8)}@xdtech.test`;
const contrasena = `Clave-${randomUUID()}`;
const reg = await fetch(`${API}/auth/registro`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({ correo, contrasena }),
});
afirmar(reg.status === 201, `registro de la cuenta desechable (${reg.status})`);
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({ correo, contrasena }),
});
const cookie = login.headers.get('set-cookie') ?? '';
const atributos = cookie
  .split(';')
  .slice(1)
  .map((a) => a.trim().toLowerCase());
afirmar(atributos.includes('httponly'), 'la cookie lleva HttpOnly');
afirmar(atributos.includes('secure'), 'la cookie lleva Secure');
afirmar(atributos.includes('samesite=lax'), 'la cookie lleva SameSite=Lax');
afirmar(
  atributos.some((a) => a === 'domain=xdtech.store' || a === 'domain=.xdtech.store'),
  'la cookie es del dominio xdtech.store',
);

// 2. CORS: solo el origen del frontend recibe cabeceras, con credenciales.
const preflight = (origen) =>
  fetch(`${API}/auth/me`, {
    method: 'OPTIONS',
    headers: { origin: origen, 'access-control-request-method': 'GET' },
  });
const ajeno = await preflight(ORIGEN_AJENO);
afirmar(
  ajeno.headers.get('access-control-allow-origin') === null,
  `un origen ajeno no recibe Access-Control-Allow-Origin (${ajeno.headers.get('access-control-allow-origin')})`,
);
const propio = await preflight(WEB);
afirmar(
  propio.headers.get('access-control-allow-origin') === WEB &&
    propio.headers.get('access-control-allow-credentials') === 'true',
  'el frontend recibe su origen y credenciales',
);

// 3. El endpoint de pruebas no existe en producción.
const pruebas = await fetch(`${API}/pruebas/inventario/vaciar`, { method: 'POST', headers: json });
afirmar(pruebas.status === 404, `POST /pruebas/inventario/vaciar responde 404 (${pruebas.status})`);

// 4. IP vista por Cloudflare: se compara a mano con cf-connecting-ip de `wrangler tail`.
const traza = await (await fetch(`${WEB}/cdn-cgi/trace`)).text();
const ip = /^ip=(.+)$/m.exec(traza)?.[1] ?? '?';
console.log(`· IP según /cdn-cgi/trace: ${ip} (comparar con cf-connecting-ip en wrangler tail)`);

// 5. Sesiones vencidas en la base (la limpieza diaria debe dejarlas en 0).
if (process.env.DIRECT_URL) {
  const bd = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await bd.connect();
  try {
    const { rows } = await bd.query(
      `SELECT count(*) FILTER (WHERE vence_en < now() - interval '1 day')::int AS vencidas,
              count(*)::int AS total FROM sesiones`,
    );
    afirmar(
      rows[0].vencidas === 0,
      `sesiones vencidas hace más de un día: ${rows[0].vencidas} (de ${rows[0].total} en total)`,
    );
    await bd.query('DELETE FROM usuarios WHERE correo = $1', [correo]);
    console.log('· cuenta desechable borrada');
  } finally {
    await bd.end();
  }
} else {
  console.log(
    '· sin DIRECT_URL: no se cuentan las sesiones vencidas ni se borra la cuenta desechable',
  );
}

// 6. Un X-Forwarded-For falso no evita el límite de inicio de sesión por IP.
if (process.argv.includes('--limite-ip')) {
  let ultimo = 0;
  for (let i = 1; i <= 51; i++) {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { ...json, 'x-forwarded-for': `203.0.113.${i}` },
      body: JSON.stringify({
        correo: `no-existe-${i}-${randomUUID()}@xdtech.test`,
        contrasena: 'x',
      }),
    });
    ultimo = r.status;
    if (r.status === 429) {
      // Cada intento usa otro correo y otro X-Forwarded-For: solo el contador por IP real lo frena.
      afirmar(true, `429 en el intento ${i} pese a un X-Forwarded-For distinto en cada uno`);
      break;
    }
  }
  if (ultimo !== 429) afirmar(false, `sin 429 tras 51 intentos (último ${ultimo})`);
}

process.exit(ok ? 0 : 1);
