import {
  ProductCard,
  ProductCardSkeleton,
  SpecsTable,
  StockBadge,
} from '@/components/producto/producto';
import type { Producto } from '@/lib/tipos';

// Componentes del catálogo en la vitrina, con datos de ejemplo (sin llamar a la API). La
// variante con imagen se comprueba en la prueba e2e de subida de imagen del panel.
const base: Producto = {
  id: '00000000-0000-7000-8000-000000000000',
  nombre: 'AMD Ryzen 5 7600',
  marca: 'AMD',
  categoria: { codigo: 'PROCESADOR', nombre: 'Procesador' },
  tipo: 'COMPONENTE',
  precio: '829.00',
  disponible: 12,
  agotado: false,
  atributos: { socket: 'AM5', potenciaConsumidaW: 65 },
  imagenUrl: null,
};

const EJEMPLOS: Producto[] = [
  base,
  {
    ...base,
    id: '00000000-0000-7000-8000-000000000001',
    nombre:
      'Kingston Fury Beast 32 GB (2x16) DDR5-6000, nombre largo para probar el corte en dos líneas',
    marca: 'Kingston',
    categoria: { codigo: 'RAM', nombre: 'Memoria RAM' },
    precio: '459.90',
    disponible: 3,
    atributos: { tipoRam: 'DDR5', velocidadRam: 6000, modulos: 2 },
  },
];

export function VitrinaProductos() {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <h2 className="text-xl">Catálogo</h2>
      <div className="flex flex-wrap gap-2">
        <StockBadge disponible={12} />
        <StockBadge disponible={3} />
        <StockBadge disponible={1} />
        <StockBadge disponible={0} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {EJEMPLOS.map((p) => (
          <ProductCard key={p.id} producto={p} />
        ))}
        <ProductCardSkeleton />
      </div>
      <div className="max-w-md">
        <SpecsTable
          atributos={{ socket: 'AM5', potenciaConsumidaW: 65, descripcion: 'Seis núcleos' }}
        />
      </div>
    </section>
  );
}
