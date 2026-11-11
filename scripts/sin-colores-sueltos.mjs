// Falla si hay colores hexadecimales o clases de color arbitrarias en el frontend fuera de
// styles/tokens.css (spec sistema-diseno, design D3 del Sprint 1.5). Multiplataforma: en
// Windows no hay grep fiable. Uso: node scripts/sin-colores-sueltos.mjs [directorio]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const raiz = process.argv[2] ?? 'apps/web/src';
const PERMITIDO = join(raiz, 'styles', 'tokens.css');
const EXTENSIONES = /\.(tsx?|css)$/;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const ARBITRARIA = /-\[#/g;

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) yield* archivos(ruta);
    else if (EXTENSIONES.test(nombre) && ruta !== PERMITIDO) yield ruta;
  }
}

const hallazgos = [];
for (const ruta of archivos(raiz)) {
  readFileSync(ruta, 'utf8')
    .split(/\r?\n/)
    .forEach((linea, i) => {
      // Un "#" seguido de hex dentro de una URL de ancla o un id no es un color: se exige
      // que no vaya precedido de letras, "/" ni "&" (por ejemplo href="/x#abc").
      for (const m of linea.matchAll(HEX)) {
        const antes = linea[m.index - 1] ?? ' ';
        if (/[\w/&]/.test(antes)) continue;
        hallazgos.push(`${relative('.', ruta).split(sep).join('/')}:${i + 1}: ${m[0]}`);
      }
      for (const m of linea.matchAll(ARBITRARIA)) {
        hallazgos.push(`${relative('.', ruta).split(sep).join('/')}:${i + 1}: clase ${m[0]}…`);
      }
    });
}

if (hallazgos.length) {
  console.error('Colores fuera de styles/tokens.css (usa los tokens):');
  for (const h of hallazgos) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`sin colores sueltos en ${raiz}`);
