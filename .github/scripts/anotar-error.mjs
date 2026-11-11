// Publica las últimas líneas de un log como anotación de error de GitHub Actions, que se
// lee sin iniciar sesión (a diferencia del log del job).
// Uso: node .github/scripts/anotar-error.mjs <archivo.log> "<título>" [líneas]
import { readFileSync } from 'node:fs';

const [archivo, titulo = 'error', lineasTexto = '25'] = process.argv.slice(2);
let texto;
try {
  texto = readFileSync(archivo, 'utf8');
} catch {
  texto = `(no se pudo leer ${archivo})`;
}
const ultimas = texto.split(/\r?\n/).slice(-Number(lineasTexto)).join('\n');
const codificar = (s) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
console.log(
  `::error title=${codificar(titulo).replaceAll(':', '%3A').replaceAll(',', '%2C')}::${codificar(ultimas)}`,
);
