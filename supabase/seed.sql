-- Kitchin · Seed opcional para desarrollo
-- Crea una tienda de prueba y unas líneas de tarifa para poder
-- empezar a probar el flujo en cuanto tengamos el login (Paso 3).
--
-- ⚠️  IMPORTANTE: este seed NO crea el usuario auth. Para vincular
--    un usuario a esta tienda, sigue las instrucciones de README.md
--    en esta misma carpeta (sección "Crear usuario admin de prueba").

-- 1. Tienda de prueba ----------------------------------------------------------
insert into public.tiendas (id, nombre, color_primario, iva_porcentaje, email_contacto, telefono, condiciones_comerciales)
values (
  '00000000-0000-0000-0000-000000000001',
  'Cocinas Demo',
  '#1E5FA8',
  21,
  'demo@kitchin.app',
  '+34 600 000 000',
  'Presupuesto válido 30 días. Precios IVA no incluido. Pago: 50% al firmar, 50% en la entrega.'
)
on conflict (id) do nothing;

-- 2. Algunas líneas de tarifa para la tienda demo -----------------------------
insert into public.tarifas (tienda_id, nombre_modulo, tipo, medida, precio)
values
  ('00000000-0000-0000-0000-000000000001', 'Módulo bajo 60cm 1 cajón',      'bajo',            '60x72x60',  185.00),
  ('00000000-0000-0000-0000-000000000001', 'Módulo bajo 60cm 3 cajones',    'bajo',            '60x72x60',  245.00),
  ('00000000-0000-0000-0000-000000000001', 'Módulo bajo 80cm fregadero',    'bajo',            '80x72x60',  210.00),
  ('00000000-0000-0000-0000-000000000001', 'Módulo bajo esquina',           'bajo',            '90x72x90',  320.00),
  ('00000000-0000-0000-0000-000000000001', 'Módulo alto 60cm',              'alto',            '60x72x35',  155.00),
  ('00000000-0000-0000-0000-000000000001', 'Módulo alto 80cm',              'alto',            '80x72x35',  175.00),
  ('00000000-0000-0000-0000-000000000001', 'Módulo alto escurridor 60cm',   'alto',            '60x72x35',  195.00),
  ('00000000-0000-0000-0000-000000000001', 'Columna despensa 60cm',         'columna',         '60x220x60', 580.00),
  ('00000000-0000-0000-0000-000000000001', 'Columna horno + microondas',    'columna',         '60x220x60', 640.00),
  ('00000000-0000-0000-0000-000000000001', 'Encimera Silestone 20mm (ml)',  'encimera',        'ml',        180.00),
  ('00000000-0000-0000-0000-000000000001', 'Encimera laminado (ml)',        'encimera',        'ml',         55.00),
  ('00000000-0000-0000-0000-000000000001', 'Placa inducción 60cm',          'electrodomestico','60',        420.00),
  ('00000000-0000-0000-0000-000000000001', 'Horno multifunción',            'electrodomestico','60',        380.00),
  ('00000000-0000-0000-0000-000000000001', 'Campana decorativa 60cm',       'electrodomestico','60',        260.00),
  ('00000000-0000-0000-0000-000000000001', 'Fregadero acero 1 cubeta',      'accesorio',       '50x40',      95.00),
  ('00000000-0000-0000-0000-000000000001', 'Zócalo aluminio (ml)',          'accesorio',       'ml',         18.00)
on conflict do nothing;
