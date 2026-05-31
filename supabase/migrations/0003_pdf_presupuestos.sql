-- Kitchin · Migración 0003 · PDF y número correlativo de presupuesto
-- Paso 12 — Pantalla 5. Aplicar entera en Supabase → SQL Editor → New query.
--
-- Cambios:
--   1. Columna numero_presupuesto en presupuestos (nullable, se asigna al generar PDF)
--   2. Índice único (tienda_id, numero_presupuesto) donde no null
--   3. Tabla presupuesto_contadores — contador atómico por (tienda, año)
--   4. RPC generar_pdf_presupuesto — asigna número, guarda pdf_url, marca 'revisado'
--   5. Política storage UPDATE para bucket pdfs (necesaria para regenerar PDF)
--
-- NOTA: modificado respecto a docx sec 7 / Pantalla 5 —
--   "Copiar enlace (genera enlace público)" implementado como signed URL de 365 días
--   (el bucket pdfs es privado; limitación de diseño aprobada en Paso 12).
--   "Enviar por email (PDF adjunto)" implementado como mailto con la URL en el cuerpo
--   (protocolo mailto no soporta adjuntos en ningún navegador moderno).

-- ============================================================
-- 1. Columna numero_presupuesto
-- ============================================================

alter table public.presupuestos
  add column if not exists numero_presupuesto text;

-- Unicidad dentro de la tienda, solo sobre filas con número asignado.
create unique index if not exists presupuestos_numero_tienda_unique
  on public.presupuestos (tienda_id, numero_presupuesto)
  where numero_presupuesto is not null;

-- ============================================================
-- 2. Tabla contadora
--    siguiente = próximo número disponible (empieza en 1).
--    RLS activado sin políticas: acceso directo bloqueado para
--    authenticated. Solo accesible desde la RPC security definer.
-- ============================================================

create table if not exists public.presupuesto_contadores (
  tienda_id   uuid     not null references public.tiendas(id) on delete cascade,
  anyo        integer  not null check (anyo between 2000 and 9999),
  siguiente   integer  not null default 1 check (siguiente >= 1),
  primary key (tienda_id, anyo)
);

alter table public.presupuesto_contadores enable row level security;
-- Sin políticas explícitas: ningún usuario authenticated puede leer ni
-- escribir esta tabla directamente. La RPC (security definer) sí puede
-- porque corre como el propietario de la función (rol postgres/superuser).

-- ============================================================
-- 3. RPC: generar_pdf_presupuesto
--
-- Recibe el id del presupuesto y la URL del PDF ya subido a Storage.
-- En una sola transacción:
--   a) valida que el caller pertenece a la tienda del presupuesto
--   b) asigna atómicamente el número correlativo (idempotente si ya tiene)
--   c) guarda pdf_url y transiciona estado borrador → revisado
--
-- security definer: necesario para escribir en presupuesto_contadores
-- sin exponer esa tabla. La comprobación de acceso es explícita.
-- ============================================================

create or replace function public.generar_pdf_presupuesto(
  p_presupuesto_id  uuid,
  p_pdf_url         text,
  p_anyo            integer default date_part('year', current_date)::integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tienda_id        uuid;
  v_numero_existente text;
  v_siguiente        integer;
  v_numero           text;
begin
  -- Verifica que el presupuesto pertenece a la tienda del caller.
  -- user_tienda_id() devuelve null si el user no está en ninguna tienda.
  select p.tienda_id, p.numero_presupuesto
  into   v_tienda_id, v_numero_existente
  from   public.presupuestos p
  where  p.id        = p_presupuesto_id
    and  p.tienda_id = public.user_tienda_id();

  if v_tienda_id is null then
    raise exception 'Presupuesto no encontrado o sin acceso'
      using errcode = '42501';
  end if;

  -- Idempotente: si ya tiene número (p.e. regeneración del PDF),
  -- solo actualiza pdf_url y preserva el estado actual.
  if v_numero_existente is not null then
    update public.presupuestos
    set pdf_url = p_pdf_url
    where id = p_presupuesto_id;

    return jsonb_build_object(
      'numero_presupuesto', v_numero_existente,
      'regenerado',         true
    );
  end if;

  -- Asignación atómica del número correlativo.
  --
  -- INSERT del primer PDF del año inserta siguiente=2 y retorna 2-1=1.
  -- INSERT posterior hace UPDATE siguiente=N+1 y retorna (N+1)-1=N.
  -- La resta en el RETURNING elimina la necesidad de un SELECT previo.
  insert into public.presupuesto_contadores (tienda_id, anyo, siguiente)
  values (v_tienda_id, p_anyo, 2)
  on conflict (tienda_id, anyo)
    do update set siguiente = presupuesto_contadores.siguiente + 1
  returning siguiente - 1 into v_siguiente;

  v_numero := p_anyo::text || '-' || lpad(v_siguiente::text, 4, '0');

  -- Actualiza el presupuesto: número, URL del PDF, estado.
  -- Solo avanza el estado desde 'borrador'; 'revisado'/'enviado' se preservan
  -- por si el vendedor regenera el PDF tras haber enviado ya el presupuesto.
  update public.presupuestos
  set numero_presupuesto = v_numero,
      pdf_url            = p_pdf_url,
      estado             = case
                             when estado = 'borrador' then 'revisado'
                             else estado
                           end
  where id = p_presupuesto_id;

  return jsonb_build_object(
    'numero_presupuesto', v_numero,
    'regenerado',         false
  );
end;
$$;

grant execute on function public.generar_pdf_presupuesto(uuid, text, integer)
  to authenticated;

-- ============================================================
-- 4. Política Storage UPDATE para bucket pdfs
--    La migración 0001 crea select/insert/delete pero no update.
--    Se necesita update para sobreescribir el PDF al regenerarlo
--    (upload con upsert:true en el cliente JS).
-- ============================================================

drop policy if exists storage_pdfs_update on storage.objects;

create policy storage_pdfs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
  )
  with check (
    bucket_id = 'pdfs'
    and (storage.foldername(name))[1] = public.user_tienda_id()::text
  );
