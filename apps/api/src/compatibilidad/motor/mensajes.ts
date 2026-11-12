// Catálogo de mensajes de rechazo por código y motivo (HU-13, design D3 del Sprint 2).
// Nombran las piezas en conflicto y la característica que no coincide.

const q = (nombre: string) => `«${nombre}»`;

export const MENSAJES = {
  socket: (cpu: string, sCpu: string, placa: string, sPlaca: string) =>
    `El procesador ${q(cpu)} usa socket ${sCpu}, pero la placa madre ${q(placa)} es ${sPlaca}.`,
  ramTipo: (ram: string, tRam: string, placa: string, tPlaca: string) =>
    `La memoria ${q(ram)} es ${tRam}, pero la placa madre ${q(placa)} solo admite ${tPlaca}.`,
  ramVelocidad: (ram: string, vRam: number, placa: string, vPlaca: number) =>
    `La memoria ${q(ram)} funciona a ${vRam} MHz, pero la placa madre ${q(placa)} admite hasta ${vPlaca} MHz.`,
  ramModulos: (total: number, placa: string, max: number) =>
    `Elegiste ${total} módulos de RAM, pero la placa madre ${q(placa)} admite como máximo ${max}.`,
  potencia: (requerida: number, margen: number, fuente: string, disponible: number) =>
    `El consumo estimado con ${margen} % de margen es ${requerida} W, pero la fuente ${q(fuente)} entrega ${disponible} W.`,
  gpuLargo: (gpu: string, largo: number, gabinete: string, max: number) =>
    `La tarjeta gráfica ${q(gpu)} mide ${largo} mm de largo, pero el gabinete ${q(gabinete)} admite hasta ${max} mm.`,
  disipadorAlto: (cpu: string, alto: number, gabinete: string, max: number) =>
    `El disipador del procesador ${q(cpu)} mide ${alto} mm de alto, pero el gabinete ${q(gabinete)} admite hasta ${max} mm.`,
  factorForma: (placa: string, ff: string, gabinete: string, soportados: string[]) =>
    `La placa madre ${q(placa)} es ${ff}, pero el gabinete ${q(gabinete)} solo admite ${soportados.join(', ')}.`,
  almacenamiento: (unidad: string, interfaz: string, placa: string, ofrecidas: string[]) =>
    `La unidad ${q(unidad)} usa ${interfaz}, pero la placa madre ${q(placa)} solo ofrece ${ofrecidas.join(', ')}.`,
} as const;
