import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const TIENDA_DEMO = '00000000-0000-0000-0000-000000000001';

const { count: tarifasDemo } = await admin
  .from('tarifas')
  .select('id', { count: 'exact', head: true })
  .eq('tienda_id', TIENDA_DEMO);
console.log(`tarifas en tienda demo: ${tarifasDemo}`);

const { data: tiendas } = await admin.from('tiendas').select('id, nombre');
console.log(`tiendas totales: ${tiendas.length}`);
for (const t of tiendas) console.log(`  ${t.id}  "${t.nombre}"`);

const { data: tarifasHuerfanas } = await admin
  .from('tarifas')
  .select('id, tienda_id, nombre_modulo')
  .neq('tienda_id', TIENDA_DEMO);
console.log(`tarifas fuera de la tienda demo: ${tarifasHuerfanas.length}`);
for (const t of tarifasHuerfanas) console.log(`  ${t.id}  tienda ${t.tienda_id}  "${t.nombre_modulo}"`);

const { data: muestra } = await admin
  .from('tarifas')
  .select('nombre_modulo, tipo, medida, precio, activo')
  .eq('tienda_id', TIENDA_DEMO)
  .order('tipo')
  .order('nombre_modulo')
  .limit(3);
console.log('\nMuestra (primeras 3):');
for (const t of muestra) console.log(`  ${t.tipo}/${t.nombre_modulo} ${t.medida} ${t.precio}€ activo=${t.activo}`);
