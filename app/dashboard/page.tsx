import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/Button';
import { Badge, type BadgeVariant } from '@/components/Badge';
import { Card } from '@/components/Card';
import type { EstadoPresupuesto } from '@/types/database';
import { logout } from './actions';

export const metadata = { title: 'Dashboard · Kitchin' };

const fmtEur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});
const fmtDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short' });

const estadoConfig: Record<
  EstadoPresupuesto,
  { label: string; variant: BadgeVariant }
> = {
  borrador: { label: 'Borrador', variant: 'neutral' },
  revisado: { label: 'Revisado', variant: 'warning' },
  enviado: { label: 'Enviado', variant: 'success' },
};

interface PresupuestoRow {
  id: string;
  cliente_nombre: string | null;
  estado: EstadoPresupuesto;
  total_bruto: number;
  created_at: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre, rol, tienda_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!usuario) {
    // No debería pasar (el login lo verifica). Defensa por si alguien
    // entra con una sesión huérfana de auth.users sin fila en public.usuarios.
    await supabase.auth.signOut();
    redirect('/login');
  }

  const { data: tienda } = await supabase
    .from('tiendas')
    .select('nombre, logo_url')
    .eq('id', usuario.tienda_id)
    .maybeSingle();

  // Inicio del mes actual en hora local del servidor.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startIso = startOfMonth.toISOString();

  // Contadores: `este mes` y `enviados (este mes)` se acotan al mes corriente;
  // `pendientes` muestra el backlog total porque es lo que hay que actuar.
  const [mesRes, enviadosRes, pendientesRes] = await Promise.all([
    supabase
      .from('presupuestos')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso),
    supabase
      .from('presupuestos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'enviado')
      .gte('created_at', startIso),
    supabase
      .from('presupuestos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'borrador'),
  ]);

  const countMes = mesRes.count ?? 0;
  const countEnviados = enviadosRes.count ?? 0;
  const countPendientes = pendientesRes.count ?? 0;

  const q = (searchParams.q ?? '').trim();
  let listQuery = supabase
    .from('presupuestos')
    .select('id, cliente_nombre, estado, total_bruto, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (q) {
    listQuery = listQuery.ilike('cliente_nombre', `%${q}%`);
  }

  const { data: presupuestos } = (await listQuery) as {
    data: PresupuestoRow[] | null;
  };
  const items = presupuestos ?? [];

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        {/* Cabecera */}
        <header className="flex items-center justify-between gap-4 pb-6">
          <div className="flex items-center gap-3 min-w-0">
            {tienda?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tienda.logo_url}
                alt={tienda.nombre}
                className="h-10 w-10 rounded-card object-contain bg-card"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-card bg-primary text-sm font-semibold text-white">
                {tienda?.nombre?.charAt(0) ?? 'K'}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-main">
                {tienda?.nombre ?? '—'}
              </p>
              <p className="truncate text-xs text-text-muted">
                {usuario.nombre}
              </p>
            </div>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost">
              Cerrar sesión
            </Button>
          </form>
        </header>

        {/* CTA principal */}
        <div className="flex flex-col items-center pb-8">
          <Link href="/nuevo-presupuesto" className="w-full sm:w-auto">
            <Button
              fullWidth
              className="sm:px-10 sm:py-4 sm:text-base"
              type="button"
            >
              + Nuevo presupuesto
            </Button>
          </Link>
        </div>

        {/* Contadores */}
        <section className="grid grid-cols-1 gap-4 pb-6 sm:grid-cols-3">
          <Counter label="Este mes" value={countMes} />
          <Counter label="Enviados (este mes)" value={countEnviados} />
          <Counter label="Pendientes de revisar" value={countPendientes} />
        </section>

        {/* Buscador */}
        <form
          method="get"
          action="/dashboard"
          className="flex flex-col gap-2 pb-4 sm:flex-row"
        >
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre del cliente..."
            className="flex-1 rounded-card border border-text-muted/30 bg-card px-3 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
            {q && (
              <Link href="/dashboard">
                <Button variant="ghost" type="button">
                  Limpiar
                </Button>
              </Link>
            )}
          </div>
        </form>

        {/* Lista */}
        <Card>
          {items.length === 0 ? (
            <EmptyState filtered={Boolean(q)} />
          ) : (
            <PresupuestosList items={items} />
          )}
        </Card>

        {/* Admin link */}
        {usuario.rol === 'admin' && (
          <div className="mt-6 text-center">
            <Link
              href="/admin"
              className="text-sm text-text-muted hover:text-text-main hover:underline"
            >
              Panel de administración
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text-main">{value}</p>
    </Card>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="p-10 text-center text-text-muted">
      {filtered ? (
        <p>No hay presupuestos que coincidan con tu búsqueda.</p>
      ) : (
        <>
          <p className="mb-2 text-text-main">
            Todavía no has creado ningún presupuesto.
          </p>
          <p className="text-sm">
            Empieza con el botón &quot;Nuevo presupuesto&quot; de arriba.
          </p>
        </>
      )}
    </div>
  );
}

function PresupuestosList({ items }: { items: PresupuestoRow[] }) {
  return (
    <ul className="divide-y divide-text-muted/15">
      {items.map((p) => {
        const cfg = estadoConfig[p.estado];
        return (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-main">
                {p.cliente_nombre || 'Sin nombre'}
              </p>
              <p className="text-xs text-text-muted">
                {fmtDate.format(new Date(p.created_at))}
              </p>
            </div>
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            <p className="hidden w-24 text-right text-sm font-medium text-text-main sm:block">
              {fmtEur.format(Number(p.total_bruto ?? 0))}
            </p>
            <Link href={`/presupuestos/${p.id}`}>
              <Button variant="ghost" type="button">
                Ver
              </Button>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
