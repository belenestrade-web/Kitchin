-- Paso 14: amplía el CHECK de tipo en tarifas y lineas_presupuesto para incluir
-- 'panel' y 'zocalo', en línea con TipoModulo en types/database.ts.

-- tarifas
alter table public.tarifas
  drop constraint if exists tarifas_tipo_check;

alter table public.tarifas
  add constraint tarifas_tipo_check
  check (tipo in ('bajo','alto','columna','electrodomestico','encimera','accesorio','panel','zocalo'));

-- lineas_presupuesto
alter table public.lineas_presupuesto
  drop constraint if exists lineas_presupuesto_tipo_check;

alter table public.lineas_presupuesto
  add constraint lineas_presupuesto_tipo_check
  check (tipo in ('bajo','alto','columna','electrodomestico','encimera','accesorio','panel','zocalo'));
