import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const DEMO_EMAIL = 'demo@kitchin.app';
const DEMO_PASS = 'Demo2026!';
const TIENDA_A = '00000000-0000-0000-0000-000000000001';

let tiendaB, tarifaB;
let pass = 0;
let fail = 0;

function check(label, cond, detalle = '') {
  if (cond) {
    console.log(`  ✓ ${label}${detalle ? ' — ' + detalle : ''}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detalle ? ' — ' + detalle : ''}`);
    fail++;
  }
}

async function setup() {
  console.log('\n[setup] Creando tienda B y una tarifa suya (vía service role)…');
  const { data: t, error: tErr } = await admin
    .from('tiendas')
    .insert({ nombre: 'Tienda RLS-Test', color_primario: '#FF0000', iva_porcentaje: 21 })
    .select('id')
    .single();
  if (tErr) throw tErr;
  tiendaB = t.id;

  const { data: tar, error: tarErr } = await admin
    .from('tarifas')
    .insert({
      tienda_id: tiendaB,
      nombre_modulo: 'Modulo cross-tienda',
      tipo: 'bajo',
      medida: '60x72x60',
      precio: 999.99,
      activo: true,
    })
    .select('id')
    .single();
  if (tarErr) throw tarErr;
  tarifaB = tar.id;
  console.log(`  tienda B = ${tiendaB}`);
  console.log(`  tarifa B = ${tarifaB} (precio inicial 999.99)`);
}

async function testCrossTienda() {
  console.log('\n[test] Login como demo@kitchin.app (admin de tienda A)…');
  const supa = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess, error: loginErr } = await supa.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASS,
  });
  if (loginErr || !sess.user) throw new Error(`Login falló: ${loginErr?.message}`);
  console.log(`  user.id = ${sess.user.id}`);

  console.log('\n[test] SELECT tarifa B (debería estar invisible por RLS)…');
  const { data: visibleB } = await supa
    .from('tarifas')
    .select('id, precio')
    .eq('id', tarifaB);
  check('SELECT id de tarifa B devuelve 0 filas', visibleB?.length === 0, `count=${visibleB?.length ?? 'null'}`);

  console.log('\n[test] SELECT global de tarifas (solo debería ver tienda A)…');
  const { data: todas } = await supa
    .from('tarifas')
    .select('tienda_id');
  const tiendas = new Set((todas ?? []).map(r => r.tienda_id));
  check('SELECT global no incluye tienda B', !tiendas.has(tiendaB), `tiendas vistas: ${[...tiendas].join(', ')}`);
  check('SELECT global incluye tienda A',     tiendas.has(TIENDA_A),  `tiendas vistas: ${[...tiendas].join(', ')}`);

  console.log('\n[test] UPDATE precio de tarifa B (debería afectar 0 filas)…');
  const { data: updRows, error: updErr } = await supa
    .from('tarifas')
    .update({ precio: 1.0 })
    .eq('id', tarifaB)
    .select('id');
  check('UPDATE no devuelve error', !updErr, updErr?.message ?? 'ok');
  check('UPDATE afecta 0 filas',     (updRows?.length ?? 0) === 0, `rows=${updRows?.length ?? 0}`);

  console.log('\n[test] Confirmación con service role: precio de B no cambió…');
  const { data: bAhora } = await admin.from('tarifas').select('precio').eq('id', tarifaB).single();
  check('precio de tarifa B sigue 999.99', Number(bAhora.precio) === 999.99, `valor real = ${bAhora.precio}`);

  console.log('\n[test] INSERT en tarifas con tienda_id = B (debería rechazarse por WITH CHECK)…');
  const { data: insRow, error: insErr } = await supa
    .from('tarifas')
    .insert({
      tienda_id: tiendaB,
      nombre_modulo: 'Intento maligno',
      tipo: 'bajo',
      medida: 'X',
      precio: 0,
      activo: true,
    })
    .select('id');
  check('INSERT cross-tienda lanza error',
    Boolean(insErr) || !insRow || insRow.length === 0,
    insErr ? `error: ${insErr.code} ${insErr.message}` : `rows=${insRow?.length ?? 0}`);

  console.log('\n[test] Sanity: el demo PUEDE leer y editar SU propia tarifa…');
  const { data: propias } = await supa
    .from('tarifas')
    .select('id, precio')
    .eq('tienda_id', TIENDA_A)
    .limit(1);
  check('SELECT de tarifa propia devuelve 1+', (propias?.length ?? 0) > 0, `count=${propias?.length}`);

  if (propias && propias.length > 0) {
    const mia = propias[0];
    const precioOriginal = mia.precio;
    const { data: updMia } = await supa
      .from('tarifas')
      .update({ precio: Number(precioOriginal) })
      .eq('id', mia.id)
      .select('id');
    check('UPDATE de tarifa propia afecta 1 fila', updMia?.length === 1, `rows=${updMia?.length ?? 0}`);
  }

  await supa.auth.signOut();
}

async function cleanup() {
  console.log('\n[cleanup] Borrando tienda B (cascade borra su tarifa)…');
  const { error } = await admin.from('tiendas').delete().eq('id', tiendaB);
  if (error) console.log('  ⚠️ cleanup falló:', error.message);
  else console.log('  ok');
}

try {
  await setup();
  await testCrossTienda();
} catch (err) {
  console.log('\nERROR no esperado:', err.message);
  fail++;
} finally {
  if (tiendaB) await cleanup();
  console.log(`\nResultado: ${pass} OK · ${fail} fallos`);
  process.exit(fail === 0 ? 0 : 1);
}
