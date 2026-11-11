'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { type DatosIngreso, type DatosRegistro, esquemaIngreso, esquemaRegistro } from '../schemas';

// Formularios de cuenta (presentación): validan en línea con zod y delegan el envío.

function ErrorApiVisible({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <p
      role="alert"
      className="rounded-control border border-danger/40 bg-surface p-3 text-sm text-danger"
    >
      {mensaje}
    </p>
  );
}

export function LoginForm({
  onEnviar,
  error,
  enviando,
}: {
  onEnviar: (datos: DatosIngreso) => void;
  error: string | null;
  enviando: boolean;
}) {
  const { register, handleSubmit, formState } = useForm<DatosIngreso>({
    resolver: zodResolver(esquemaIngreso),
    mode: 'onTouched',
  });
  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onEnviar)} noValidate>
      <FormField etiqueta="Correo" error={formState.errors.correo?.message}>
        <Input type="email" autoComplete="email" {...register('correo')} />
      </FormField>
      <FormField etiqueta="Contraseña" error={formState.errors.contrasena?.message}>
        <Input type="password" autoComplete="current-password" {...register('contrasena')} />
      </FormField>
      <ErrorApiVisible mensaje={error} />
      <Button type="submit" tamano="lg" disabled={enviando}>
        {enviando ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  );
}

export function RegistroForm({
  onEnviar,
  error,
  enviando,
}: {
  onEnviar: (datos: DatosRegistro) => void;
  error: string | null;
  enviando: boolean;
}) {
  const { register, handleSubmit, formState } = useForm<DatosRegistro>({
    resolver: zodResolver(esquemaRegistro),
    mode: 'onTouched',
  });
  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onEnviar)} noValidate>
      <FormField etiqueta="Correo" error={formState.errors.correo?.message}>
        <Input type="email" autoComplete="email" {...register('correo')} />
      </FormField>
      <FormField
        etiqueta="Contraseña (8 caracteres o más)"
        error={formState.errors.contrasena?.message}
      >
        <Input type="password" autoComplete="new-password" {...register('contrasena')} />
      </FormField>
      <ErrorApiVisible mensaje={error} />
      <Button type="submit" tamano="lg" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear cuenta'}
      </Button>
    </form>
  );
}
