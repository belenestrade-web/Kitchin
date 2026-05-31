import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ResetPasswordForm from './ResetPasswordForm';

export const metadata = {
  title: 'Restablecer contraseña · Kitchin',
};

export default async function ResetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sólo accesible inmediatamente después del enlace de reset, cuando Supabase
  // ha creado una sesión temporal. Si no hay sesión, mejor al login.
  if (!user) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card bg-card p-8 shadow-card">
        <h1 className="mb-2 text-xl font-semibold text-text-main">
          Elige una contraseña nueva
        </h1>
        <p className="mb-6 text-sm text-text-muted">
          La contraseña debe tener al menos 8 caracteres.
        </p>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
