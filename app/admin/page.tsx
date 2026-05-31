import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Tarifa } from '@/types/database';
import IdentidadVisualSection from './IdentidadVisualSection';
import TarifaSection from './TarifaSection';

export const metadata = { title: 'Administración · Kitchin' };

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, tienda_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario) {
    await supabase.auth.signOut();
    redirect('/login');
  }
  if (usuario.rol !== 'admin') redirect('/dashboard');

  const [{ data: tienda }, { data: tarifas }] = await Promise.all([
    supabase
      .from('tiendas')
      .select(
        'nombre, logo_url, color_primario, condiciones_comerciales, email_contacto, telefono, direccion',
      )
      .eq('id', usuario.tienda_id)
      .maybeSingle(),
    supabase
      .from('tarifas')
      .select('id, tienda_id, nombre_modulo, tipo, medida, precio, activo')
      .order('tipo', { ascending: true })
      .order('nombre_modulo', { ascending: true }),
  ]);

  // URL pública del logo para el preview (bucket logos es público).
  let logoPublicUrl: string | null = null;
  if (tienda?.logo_url) {
    const { data } = supabase.storage
      .from('logos')
      .getPublicUrl(tienda.logo_url);
    logoPublicUrl = data.publicUrl;
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-10">
        <Link
          href="/dashboard"
          className="inline-block text-sm text-text-muted hover:text-text-main hover:underline"
        >
          ← Volver al dashboard
        </Link>

        <header>
          <h1 className="text-2xl font-semibold text-text-main">
            Administración
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Configura la identidad visual, las condiciones y la tarifa de tu
            tienda.
          </p>
        </header>

        <IdentidadVisualSection
          tiendaId={usuario.tienda_id}
          nombre={tienda?.nombre ?? ''}
          emailContacto={tienda?.email_contacto ?? null}
          telefono={tienda?.telefono ?? null}
          direccion={tienda?.direccion ?? null}
          colorPrimario={tienda?.color_primario ?? '#1E5FA8'}
          condicionesComerciales={tienda?.condiciones_comerciales ?? null}
          logoPath={tienda?.logo_url ?? null}
          logoPublicUrl={logoPublicUrl}
        />

        <TarifaSection tarifasIniciales={(tarifas ?? []) as Tarifa[]} />
      </div>
    </main>
  );
}
