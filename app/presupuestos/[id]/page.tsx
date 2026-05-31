import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Badge, type BadgeVariant } from '@/components/Badge';
import type { EstadoPresupuesto, LineaPresupuesto } from '@/types/database';
import PresupuestoDetalle from './PresupuestoDetalle';

export const metadata = { title: 'Presupuesto · Kitchin' };

const fmtDate = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
});

const estadoConfig: Record<
  EstadoPresupuesto,
  { label: string; variant: BadgeVariant }
> = {
  borrador: { label: 'Borrador', variant: 'neutral' },
  revisado: { label: 'Revisado', variant: 'warning' },
  enviado: { label: 'Enviado', variant: 'success' },
};

export default async function PresupuestoDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('tienda_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  const { data: presupuesto } = await supabase
    .from('presupuestos')
    .select('id, cliente_nombre, estado, notas_ia, created_at, imagen_url')
    .eq('id', params.id)
    .maybeSingle();
  if (!presupuesto) notFound();

  const { data: tienda } = await supabase
    .from('tiendas')
    .select('iva_porcentaje')
    .eq('id', usuario.tienda_id)
    .maybeSingle();

  // Signed URL para la miniatura del plano en Pantalla 4a (Paso 10). TTL
  // corto: el cliente carga la imagen al abrir la pantalla; si el vendedor
  // tarda más de 10 min en responder, un re-análisis natural genera otra URL.
  let planoUrl: string | null = null;
  if (presupuesto.imagen_url) {
    const { data: signed } = await supabase.storage
      .from('planos')
      .createSignedUrl(presupuesto.imagen_url, 600);
    planoUrl = signed?.signedUrl ?? null;
  }

  // Líneas guardadas del borrador (Paso 11). RLS las acota a la tienda del
  // usuario vía `lineas_select_same_tienda`.
  const { data: lineasRaw } = await supabase
    .from('lineas_presupuesto')
    .select(
      'id, presupuesto_id, nombre_modulo, tipo, medida, descripcion, unidades, precio_unitario, subtotal, editado_manualmente, orden'
    )
    .eq('presupuesto_id', params.id)
    .order('orden', { ascending: true });
  const lineasGuardadas = (lineasRaw ?? []) as LineaPresupuesto[];

  const cfg = estadoConfig[presupuesto.estado as EstadoPresupuesto];

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/dashboard"
          className="inline-block text-sm text-text-muted hover:text-text-main hover:underline"
        >
          ← Volver al dashboard
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-text-main">
              {presupuesto.cliente_nombre || 'Sin nombre de cliente'}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Creado el {fmtDate.format(new Date(presupuesto.created_at))}
            </p>
          </div>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </header>

        <PresupuestoDetalle
          presupuestoId={presupuesto.id}
          ivaPorcentaje={tienda?.iva_porcentaje ?? 21}
          notasIniciales={presupuesto.notas_ia}
          planoUrl={planoUrl}
          lineasIniciales={lineasGuardadas}
        />
      </div>
    </main>
  );
}
