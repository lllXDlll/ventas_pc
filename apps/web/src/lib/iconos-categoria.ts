import {
  Box,
  CircuitBoard,
  Cpu,
  Gpu,
  HardDrive,
  type LucideIcon,
  MemoryStick,
  Monitor,
  Zap,
} from 'lucide-react';
import type { CodigoCategoria } from './atributos';

/** Icono de línea por categoría (trazo 1,5): rejilla, mega menú y producto sin imagen. */
export const ICONO_CATEGORIA: Record<CodigoCategoria, LucideIcon> = {
  PROCESADOR: Cpu,
  PLACA_MADRE: CircuitBoard,
  RAM: MemoryStick,
  TARJETA_GRAFICA: Gpu,
  FUENTE: Zap,
  GABINETE: Box,
  ALMACENAMIENTO: HardDrive,
  EQUIPO_ARMADO: Monitor,
};
