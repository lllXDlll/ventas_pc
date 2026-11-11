import { AlertTriangle, Cpu, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Select } from '@/components/ui/input';
import { BotonProximamente } from '@/components/ui/proximamente';
import { Skeleton } from '@/components/ui/skeleton';
import { EstadoError, EstadoVacio } from '@/components/ui/estado';
import { formatoPrecio } from '@/lib/format';
import { VitrinaProductos } from './vitrina-productos';

// Vitrina interna de componentes (spec arquitectura-frontend): fuera de la navegación y
// de los buscadores.
export const metadata: Metadata = {
  title: 'Vitrina de componentes',
  robots: { index: false, follow: false },
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <h2 className="text-xl">{titulo}</h2>
      {children}
    </section>
  );
}

export default function VitrinaUi() {
  return (
    <div className="contenedor flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl">Vitrina de componentes</h1>
        <p className="text-text-muted">
          Componentes base de <code>components/ui</code> con sus variantes y estados.
        </p>
      </header>

      <Seccion titulo="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primario</Button>
          <Button variante="secundario">Secundario</Button>
          <Button variante="fantasma">Fantasma</Button>
          <Button variante="contorno">Contorno</Button>
          <Button variante="degradado">
            <Sparkles strokeWidth={1.5} /> Arma tu PC con IA
          </Button>
          <Button variante="peligro">Peligro</Button>
          <Button disabled>Deshabilitado</Button>
          <Button tamano="sm">Pequeño</Button>
          <Button tamano="lg">Grande</Button>
          <Button tamano="icono" variante="contorno" aria-label="Procesador">
            <Cpu strokeWidth={1.5} />
          </Button>
          <BotonProximamente variante="contorno">Añadir al carrito</BotonProximamente>
        </div>
      </Seccion>

      <Seccion titulo="Campos">
        <div className="grid max-w-xl gap-4 md:grid-cols-2">
          <FormField etiqueta="Correo" ayuda="Nunca lo compartimos.">
            <Input type="email" placeholder="tu@correo.com" />
          </FormField>
          <FormField etiqueta="Contraseña" error="Debe tener al menos 8 caracteres.">
            <Input type="password" defaultValue="corta" />
          </FormField>
          <FormField etiqueta="Categoría">
            <Select defaultValue="RAM">
              <option value="PROCESADOR">Procesador</option>
              <option value="RAM">Memoria RAM</option>
            </Select>
          </FormField>
          <FormField etiqueta="Deshabilitado">
            <Input disabled defaultValue="No editable" />
          </FormField>
        </div>
      </Seccion>

      <Seccion titulo="Insignias">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutra</Badge>
          <Badge variante="exito">En stock</Badge>
          <Badge variante="advertencia">Últimas 3 unidades</Badge>
          <Badge variante="peligro">Agotado</Badge>
          <Badge variante="ia">
            <Sparkles strokeWidth={1.5} /> IA
          </Badge>
        </div>
      </Seccion>

      <Seccion titulo="Tarjetas y tipografía">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tarjeta</CardTitle>
              <p className="text-sm text-text-muted">Sin sombra en reposo.</p>
            </CardHeader>
            <CardContent>
              <p className="font-display text-2xl font-bold">{formatoPrecio('1299.00')}</p>
            </CardContent>
          </Card>
          <Card interactiva>
            <CardHeader>
              <CardTitle>Tarjeta interactiva</CardTitle>
              <p className="text-sm text-text-muted">Borde y brillo morado en hover.</p>
            </CardHeader>
          </Card>
        </div>
      </Seccion>

      <Seccion titulo="Carga, vacío y error">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
          </div>
          <EstadoVacio titulo="Sin resultados" descripcion="Prueba con otros filtros." />
          <EstadoError mensaje="No se pudo conectar con la API." />
        </div>
      </Seccion>

      <Seccion titulo="Diálogo">
        <Dialog>
          <DialogTrigger asChild>
            <Button variante="contorno" className="self-start">
              <AlertTriangle strokeWidth={1.5} /> Abrir diálogo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Diálogo</DialogTitle>
            <DialogDescription>Esc lo cierra y el foco vuelve al botón.</DialogDescription>
          </DialogContent>
        </Dialog>
      </Seccion>

      <VitrinaProductos />
    </div>
  );
}
