import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const TIENDA_ID = '00000000-0000-0000-0000-000000000001';

const { count, error: countErr } = await admin
  .from('tarifas')
  .select('id', { count: 'exact', head: true })
  .eq('tienda_id', TIENDA_ID);
if (countErr) throw countErr;

if ((count ?? 0) > 0) {
  console.log(`La tienda demo ya tiene ${count} líneas de tarifa. Skip.`);
  process.exit(0);
}

const filas = [
  ['Módulo bajo 60cm 1 cajón',      'bajo',             '60x72x60',  185.00],
  ['Módulo bajo 60cm 3 cajones',    'bajo',             '60x72x60',  245.00],
  ['Módulo bajo 80cm fregadero',    'bajo',             '80x72x60',  210.00],
  ['Módulo bajo esquina',           'bajo',             '90x72x90',  320.00],
  ['Módulo alto 60cm',              'alto',             '60x72x35',  155.00],
  ['Módulo alto 80cm',              'alto',             '80x72x35',  175.00],
  ['Módulo alto escurridor 60cm',   'alto',             '60x72x35',  195.00],
  ['Columna despensa 60cm',         'columna',          '60x220x60', 580.00],
  ['Columna horno + microondas',    'columna',          '60x220x60', 640.00],
  ['Encimera Silestone 20mm (ml)',  'encimera',         'ml',        180.00],
  ['Encimera laminado (ml)',        'encimera',         'ml',         55.00],
  ['Placa inducción 60cm',          'electrodomestico', '60',        420.00],
  ['Horno multifunción',            'electrodomestico', '60',        380.00],
  ['Campana decorativa 60cm',       'electrodomestico', '60',        260.00],
  ['Fregadero acero 1 cubeta',      'accesorio',        '50x40',      95.00],
  ['Zócalo aluminio (ml)',          'accesorio',        'ml',         18.00],
].map(([nombre_modulo, tipo, medida, precio]) => ({
  tienda_id: TIENDA_ID,
  nombre_modulo,
  tipo,
  medida,
  precio,
  activo: true,
}));

const { error } = await admin.from('tarifas').insert(filas);
if (error) throw error;

console.log(`Insertadas ${filas.length} líneas de tarifa para la tienda demo.`);
