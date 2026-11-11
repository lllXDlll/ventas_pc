import { describe, expect, it } from 'vitest';
import { archivoDeClave, claveImagen, extensionDeArchivo, tipoImagen } from './imagenes';

const bytes = (...b: (number | string)[]) =>
  new Uint8Array(
    b.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])),
  );

describe('tipoImagen', () => {
  it('reconoce JPEG, PNG y WebP por sus bytes iniciales', () => {
    expect(tipoImagen(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('jpg');
    expect(tipoImagen(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('png');
    expect(tipoImagen(bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 '))).toBe('webp');
  });

  it('rechaza texto, un archivo vacío y cabeceras incompletas', () => {
    expect(tipoImagen(bytes('esto no es una imagen'))).toBeNull();
    expect(tipoImagen(new Uint8Array())).toBeNull();
    expect(tipoImagen(bytes(0x89, 'PNG'))).toBeNull();
    expect(tipoImagen(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull();
  });
});

describe('claves', () => {
  it('cada subida tiene su propia clave y el archivo se recupera de ella', () => {
    const unico = '0195a000-0000-7000-8000-000000000001';
    const clave = claveImagen('p1', 'webp', unico);
    expect(clave).toBe(`productos/p1/${unico}.webp`);
    expect(archivoDeClave(clave)).toBe(`${unico}.webp`);
    expect(archivoDeClave('productos/p1/../otro.webp')).toBeNull();
    expect(extensionDeArchivo(`${unico}.png`)).toBe('png');
    expect(extensionDeArchivo('a.gif')).toBeNull();
  });
});
