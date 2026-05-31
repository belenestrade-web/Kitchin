import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import NuevoPresupuestoForm from './NuevoPresupuestoForm';

export const metadata = { title: 'Nuevo presupuesto · Kitchin' };

export default async function NuevoPresupuestoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-xl font-semibold text-text-main">
          Nuevo presupuesto
        </h1>
        <NuevoPresupuestoForm />
      </div>
    </main>
  );
}
