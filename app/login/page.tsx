import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LoginForm from './LoginForm';

export const metadata = {
  title: 'Accede a tu cuenta · Kitchin',
};

export default async function LoginPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* TODO Paso 13: si el deploy está asociado a una tienda, mostrar su
            logo aquí. Por ahora marca genérica. */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-primary text-lg font-semibold text-white">
            K
          </div>
          <p className="mt-2 text-sm text-text-muted">Kitchin</p>
        </div>

        <div className="rounded-card bg-card p-8 shadow-card">
          <h1 className="mb-6 text-xl font-semibold text-text-main">
            Accede a tu cuenta
          </h1>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
