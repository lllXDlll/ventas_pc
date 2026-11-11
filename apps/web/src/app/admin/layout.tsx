import type { Metadata } from 'next';
import { AdminShell } from '@/components/layout/shell';
import { SoloAdmin } from '@/features/auth/contenedores/solo-admin';

export const metadata: Metadata = { title: 'Administración', robots: { index: false } };

/** Todo /admin: solo para ADMIN (spec autorizacion-roles), dentro del marco del panel. */
export default function LayoutAdmin({ children }: LayoutProps<'/admin'>) {
  return (
    <SoloAdmin>
      <AdminShell>{children}</AdminShell>
    </SoloAdmin>
  );
}
