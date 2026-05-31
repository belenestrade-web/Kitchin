-- Kitchin · Migración 0002 · Función RPC atómica de guardado de líneas
-- Paso 11. Aplicar entera en SQL Editor del dashboard.
--
-- Reemplaza todas las líneas de un presupuesto en una sola transacción y
-- recalcula los totales. Diseñada para ser llamada desde la server action
-- `guardarLineas` con security invoker → la RLS de presupuestos /
-- lineas_presupuesto / tiendas aplica con la identidad del caller.

create or replace function public.guardar_lineas_presupuesto(
  p_presupuesto_id uuid,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tienda_id uuid;
  v_iva_porcentaje integer;
  v_total_neto numeric(10,2);
  v_total_iva numeric(10,2);
  v_total_bruto numeric(10,2);
begin
  -- Lee tienda + IVA. La RLS de presupuestos y tiendas se aplica aquí:
  -- si el caller no pertenece a la tienda del presupuesto, el SELECT
  -- devuelve 0 filas y v_tienda_id queda en null.
  select p.tienda_id, t.iva_porcentaje
  into v_tienda_id, v_iva_porcentaje
  from public.presupuestos p
  join public.tiendas t on t.id = p.tienda_id
  where p.id = p_presupuesto_id;

  if v_tienda_id is null then
    raise exception 'Presupuesto no encontrado o sin acceso'
      using errcode = '42501';
  end if;

  -- Reemplazo atómico. RLS de lineas_presupuesto sigue aplicando dentro
  -- de la función con security invoker.
  delete from public.lineas_presupuesto
    where presupuesto_id = p_presupuesto_id;

  insert into public.lineas_presupuesto (
    presupuesto_id, nombre_modulo, tipo, medida, descripcion,
    unidades, precio_unitario, editado_manualmente, orden
  )
  select
    p_presupuesto_id,
    coalesce(x->>'nombre_modulo', ''),
    x->>'tipo',
    nullif(x->>'medida', ''),
    nullif(x->>'descripcion', ''),
    (x->>'unidades')::integer,
    (x->>'precio_unitario')::numeric,
    coalesce((x->>'editado_manualmente')::boolean, false),
    (ord - 1)::integer
  from jsonb_array_elements(p_lineas) with ordinality as t(x, ord);

  -- Recalcula totales desde la BD (subtotal es generated en el schema).
  select coalesce(sum(subtotal), 0)
  into v_total_neto
  from public.lineas_presupuesto
  where presupuesto_id = p_presupuesto_id;

  v_total_iva := round(v_total_neto * v_iva_porcentaje / 100, 2);
  v_total_bruto := round(v_total_neto + v_total_iva, 2);

  update public.presupuestos
  set total_neto = v_total_neto,
      total_iva = v_total_iva,
      total_bruto = v_total_bruto
  where id = p_presupuesto_id;

  return jsonb_build_object(
    'total_neto', v_total_neto,
    'total_iva', v_total_iva,
    'total_bruto', v_total_bruto,
    'lineas_count', (
      select count(*) from public.lineas_presupuesto
      where presupuesto_id = p_presupuesto_id
    )
  );
end;
$$;

grant execute on function public.guardar_lineas_presupuesto(uuid, jsonb)
  to authenticated;
