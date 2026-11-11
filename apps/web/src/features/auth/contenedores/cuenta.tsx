'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mensajeDeError } from '@/lib/api-client';
import { registrar } from '../api';
import { AuthCard } from '../components/auth-card';
import { LoginForm, RegistroForm } from '../components/formularios';
import { MenuCuenta } from '../components/menu-cuenta';
import { useCerrarSesion, useIniciarSesion, useSesion } from '../hooks/use-sesion';

/** Cabecera: estado de la sesión y cierre de sesión. */
export function CuentaCabecera({ className }: { className?: string }) {
  const { usuario } = useSesion();
  const salir = useCerrarSesion();
  const router = useRouter();
  return (
    <MenuCuenta
      className={className}
      usuario={usuario}
      onSalir={() => salir.mutate(undefined, { onSettled: () => router.push('/') })}
    />
  );
}

/** Inicio de sesión (spec autenticacion): el error es siempre el genérico de la API. */
export function IngresarContenedor() {
  const ingreso = useIniciarSesion();
  const router = useRouter();
  return (
    <AuthCard
      titulo="Iniciar sesión"
      descripcion="Accede para guardar tus armados y comprar."
      pie={
        <div className="flex flex-col gap-2">
          <Link href="/recuperar" className="text-primary-soft underline underline-offset-2">
            ¿Olvidaste tu contraseña?
          </Link>
          <p>
            ¿No tienes cuenta?{' '}
            <Link href="/registro" className="text-primary-soft underline underline-offset-2">
              Créala aquí
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm
        enviando={ingreso.isPending}
        error={ingreso.isError ? mensajeDeError(ingreso.error, 'No se pudo iniciar sesión.') : null}
        onEnviar={(datos) =>
          ingreso.mutate(datos, {
            onSuccess: (u) => router.push(u.rol === 'ADMIN' ? '/admin/catalogo' : '/catalogo'),
          })
        }
      />
    </AuthCard>
  );
}

/** Registro (spec autenticacion): muestra los mensajes de la API, incluidos 409 y 429. */
export function RegistroContenedor() {
  const [creado, setCreado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (creado) {
    return (
      <AuthCard titulo="Cuenta creada">
        <p className="text-success">
          La cuenta {creado} está lista. Ya puedes{' '}
          <Link href="/ingresar" className="underline">
            iniciar sesión
          </Link>
          .
        </p>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      titulo="Crear cuenta"
      descripcion="Regístrate con tu correo para comprar y guardar tus armados."
      pie={
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link href="/ingresar" className="text-primary-soft underline underline-offset-2">
            Inicia sesión
          </Link>
        </p>
      }
    >
      <RegistroForm
        enviando={enviando}
        error={error}
        onEnviar={async (datos) => {
          setEnviando(true);
          setError(null);
          try {
            setCreado((await registrar(datos)).correo);
          } catch (e) {
            setError(mensajeDeError(e, 'No se pudo crear la cuenta.'));
          } finally {
            setEnviando(false);
          }
        }}
      />
    </AuthCard>
  );
}
