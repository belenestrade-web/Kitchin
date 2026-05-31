-- Kitchin · Migración 0001 · Schema inicial
-- Spec sección 3 (tablas) + 8 (seguridad/RLS).
-- Pegar y ejecutar entero en Supabase → SQL Editor → New query.

-- ============================================================
-- Extensiones
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Tablas
-- ============================================================

create table if not exists public.tiendas (
  id                       uuid          primary key default gen_random_uuid(),
  nombre                   text          not null,
  logo_url                 text,
  color_primario           text          not null default '#1E5FA8',
  condiciones_comerciales  text,
  iva_porcentaje           integer       not null default 21 check (iva_porcentaje between 0 and 100),
  email_contacto           text,
  telefono                 text,
  direccion                text,
  created_at               timestamptz   not null default now()
);

create table if not exists public.usuarios (
  id           uuid        primary key references auth.users(id) on delete cascade,
  tienda_id    uuid        not null references public.tiendas(id) on delete cascade,
  nombre       text        not null,
  email        text        not null,
  rol          text        not null check (rol in ('admin', 'vendedor')),
  created_at   timestamptz not null default now()
);
create index if not exists usuarios_tienda_id_idx on public.usuarios(tienda_id);

create table if not exists public.tarifas (
  id              uuid          primary key default gen_random_uuid(),
  tienda_id       uuid          not null references public.tiendas(id) on delete cascade,
  nombre_modulo   text          not null,
  tipo            text          not null check (tipo in ('bajo','alto','columna','electrodomestico','encimera','accesorio')),
  medida          text,
  precio          numeric(10,2) not null default 0 check (precio >= 0),
  activo          boolean       not null default true
);
create index if not exists tarifas_tienda_id_idx on public.tarifas(tienda_id);
create index if not exists tarifas_tienda_activo_idx on public.tarifas(tienda_id, activo);

create table if not exists public.presupuestos (
  id                 uuid          primary key default gen_random_uuid(),
  tienda_id          uuid          not null references public.tiendas(id) on delete cascade,
  usuario_id         uuid          not null references public.usuarios(id) on delete restrict,
  cliente_nombre     text,
  cliente_email      text,
  cliente_telefono   text,
  imagen_url         text,
  estado             text          not null default 'borrador'
                                  check (estado in ('borrador','revisado','enviado')),
  notas_ia           text,
  total_neto         numeric(10,2) not null default 0,
  total_iva          numeric(10,2) not null default 0,
  total_bruto        numeric(10,2) not null default 0,
  pdf_url            text,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);
create index if not exists presupuestos_tienda_id_idx on public.presupuestos(tienda_id);
create index if not exists presupuestos_usuario_id_idx on public.presupuestos(usuario_id);
create index if not exists presupuestos_estado_idx on public.presupuestos(tienda_id, estado);
create index if not exists presupuestos_created_idx on public.presupuestos(tienda_id, created_at desc);

create table if not exists public.lineas_presupuesto (
  id                    uuid          primary key default gen_random_uuid(),
  presupuesto_id        uuid          not null references public.presupuestos(id) on delete cascade,
  nombre_modulo         text          not null,
  tipo                  text          not null check (tipo in ('bajo','alto','columna','electrodomestico','encimera','accesorio')),
  medida                text,
  descripcion           text,
  unidades              integer       not null default 1 check (unidades >= 0),
  precio_unitario       numeric(10,2) not null default 0,
  subtotal              numeric(12,2) generated always as (unidades * precio_unitario) stored,
  editado_manualmente   boolean       not null default false,
  orden                 integer       not null default 0
);
create index if not exists lineas_presupuesto_idx on public.lineas_presupuesto(presupuesto_id, orden);

-- ============================================================
-- Trigger updated_at en presupuestos
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists presupuestos_set_updated_at on public.presupuestos;
create trigger presupuestos_set_updated_at
  before update on public.presupuestos
  for each row execute function public.set_updated_at();

-- ============================================================
-- Helpers para RLS (security definer para que la policy pueda leer
-- public.usuarios sin entrar en bucle de RLS recursivo).
-- ============================================================
create or replace function public.user_tienda_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tienda_id from public.usuarios where id = auth.uid()
$$;

create or replace function public.user_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid()
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.tiendas             enable row level security;
alter table public.usuarios            enable row level security;
alter table public.tarifas             enable row level security;
alter table public.presupuestos        enable row level security;
alter table public.lineas_presupuesto  enable row level security;

-- tiendas ------------------------------------------------------
drop policy if exists tiendas_select_own        on public.tiendas;
drop policy if exists tiendas_update_admin      on public.tiendas;

create policy tiendas_select_own on public.tiendas
  for select to authenticated
  using (id = public.user_tienda_id());

create policy tiendas_update_admin on public.tiendas
  for update to authenticated
  using (id = public.user_tienda_id() and public.user_rol() = 'admin')
  with check (id = public.user_tienda_id() and public.user_rol() = 'admin');

-- usuarios -----------------------------------------------------
-- Selección: cualquier miembro de la tienda ve a los suyos.
-- Insert/Update/Delete: solo admin de la misma tienda.
drop policy if exists usuarios_select_same_tienda on public.usuarios;
drop policy if exists usuarios_admin_insert       on public.usuarios;
drop policy if exists usuarios_admin_update       on public.usuarios;
drop policy if exists usuarios_admin_delete       on public.usuarios;

create policy usuarios_select_same_tienda on public.usuarios
  for select to authenticated
  using (tienda_id = public.user_tienda_id());

create policy usuarios_admin_insert on public.usuarios
  for insert to authenticated
  with check (tienda_id = public.user_tienda_id() and public.user_rol() = 'admin');

create policy usuarios_admin_update on public.usuarios
  for update to authenticated
  using (tienda_id = public.user_tienda_id() and public.user_rol() = 'admin')
  with check (tienda_id = public.user_tienda_id() and public.user_rol() = 'admin');

create policy usuarios_admin_delete on public.usuarios
  for delete to authenticated
  using (tienda_id = public.user_tienda_id() and public.user_rol() = 'admin');

-- tarifas ------------------------------------------------------
drop policy if exists tarifas_select_same_tienda on public.tarifas;
drop policy if exists tarifas_admin_write        on public.tarifas;

create policy tarifas_select_same_tienda on public.tarifas
  for select to authenticated
  using (tienda_id = public.user_tienda_id());

create policy tarifas_admin_write on public.tarifas
  for all to authenticated
  using (tienda_id = public.user_tienda_id() and public.user_rol() = 'admin')
  with check (tienda_id = public.user_tienda_id() and public.user_rol() = 'admin');

-- presupuestos -------------------------------------------------
drop policy if exists presupuestos_select_same_tienda on public.presupuestos;
drop policy if exists presupuestos_insert_same_tienda on public.presupuestos;
drop policy if exists presupuestos_update_same_tienda on public.presupuestos;
drop policy if exists presupuestos_delete_admin       on public.presupuestos;

create policy presupuestos_select_same_tienda on public.presupuestos
  for select to authenticated
  using (tienda_id = public.user_tienda_id());

create policy presupuestos_insert_same_tienda on public.presupuestos
  for insert to authenticated
  with check (tienda_id = public.user_tienda_id() and usuario_id = auth.uid());

create policy presupuestos_update_same_tienda on public.presupuestos
  for update to authenticated
  using (tienda_id = public.user_tienda_id())
  with check (tienda_id = public.user_tienda_id());

create policy presupuestos_delete_admin on public.presupuestos
  for delete to authenticated
  using (tienda_id = public.user_tienda_id() and public.user_rol() = 'admin');

-- lineas_presupuesto ------------------------------------------
-- Cualquier miembro de la tienda puede CRUD las líneas de los
-- presupuestos de su tienda.
drop policy if exists lineas_select_same_tienda on public.lineas_presupuesto;
drop policy if exists lineas_insert_same_tienda on public.lineas_presupuesto;
drop policy if exists lineas_update_same_tienda on public.lineas_presupuesto;
drop policy if exists lineas_delete_same_tienda on public.lineas_presupuesto;

create policy lineas_select_same_tienda on public.lineas_presupuesto
  for select to authenticated
  using (exists (
    select 1 from public.presupuestos p
    where p.id = lineas_presupuesto.presupuesto_id
      and p.tienda_id = public.user_tienda_id()
  ));

create policy lineas_insert_same_tienda on public.lineas_presupuesto
  for insert to authenticated
  with check (exists (
    select 1 from public.presupuestos p
    where p.id = lineas_presupuesto.presupuesto_id
      and p.tienda_id = public.user_tienda_id()
  ));

create policy lineas_update_same_tienda on public.lineas_presupuesto
  for update to authenticated
  using (exists (
    select 1 from public.presupuestos p
    where p.id = lineas_presupuesto.presupuesto_id
      and p.tienda_id = public.user_tienda_id()
  ))
  with check (exists (
    select 1 from public.presupuestos p
    where p.id = lineas_presupuesto.presupuesto_id
      and p.tienda_id = public.user_tienda_id()
  ));

create policy lineas_delete_same_tienda on public.lineas_presupuesto
  for delete to authenticated
  using (exists (
    select 1 from public.presupuestos p
    where p.id = lineas_presupuesto.presupuesto_id
      and p.tienda_id = public.user_tienda_id()
  ));

-- ============================================================
-- Storage buckets
--   planos  → privado (imágenes/PDFs subidos por el vendedor)
--   pdfs    → privado (presupuestos generados)
--   logos   → público (logo de la tienda mostrado en login)
-- Convención de carpetas: <tienda_id>/<archivo>
-- ============================================================
insert into storage.buckets (id, name, public)
values
  ('planos', 'planos', false),
  ('pdfs',   'pdfs',   false),
  ('logos',  'logos',  true)
on conflict (id) do nothing;

-- Políticas de storage.objects para los tres buckets.
-- La carpeta de primer nivel debe coincidir con el tienda_id del usuario.
drop policy if exists storage_planos_select on storage.objects;
drop policy if exists storage_planos_insert on storage.objects;
drop policy if exists storage_planos_delete on storage.objects;
drop policy if exists storage_pdfs_select   on storage.objects;
drop policy if exists storage_pdfs_insert   on storage.objects;
drop policy if exists storage_pdfs_delete   on storage.objects;
drop policy if exists storage_logos_select  on storage.objects;
drop policy if exists storage_logos_write   on storage.objects;

create policy storage_planos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'planos'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
  );

create policy storage_planos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'planos'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
  );

create policy storage_planos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'planos'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
  );

create policy storage_pdfs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
  );

create policy storage_pdfs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
  );

create policy storage_pdfs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
  );

-- Logos: lectura pública, escritura solo admins de la misma tienda
create policy storage_logos_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'logos');

create policy storage_logos_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
    and public.user_rol() = 'admin'
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
    and public.user_rol() = 'admin'
  );
