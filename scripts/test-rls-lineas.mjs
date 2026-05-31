// Test de aislamiento RLS para lineas_presupuesto + RPC guardar_lineas_presupuesto.
// Confirma que un admin de la tienda A no puede leer ni modificar líneas de un
// presupuesto que pertenece a otra tienda (B), ni vía SELECT/UPDATE/DELETE
// directos sobre la tabla, ni vía la RPC atómica del Paso 11.

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
const DEMO_USER_ID = '2428661b-ba9e-4c5d-87ee-a7a9736d7dc6';

let tiendaB, presupuestoB, lineaB, presupuestoPropio;
let pass = 0, fail = 0;

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
  console.log('\n[setup] Creando tienda B con presupuesto + línea (service role)…');
  const { data: t, error: tErr } = await admin
    .from('tiendas')
    .insert({ nombre: 'Tienda RLS-Test Lineas', color_primario: '#FF0000', iva_porcentaje: 21 })
    .select('id').single();
  if (tErr) throw tErr;
  tiendaB = t.id;

  const { data: p, error: pErr } = await admin
    .from('presupuestos')
    .insert({
      tienda_id: tiendaB,
      usuario_id: DEMO_USER_ID,
      cliente_nombre: 'Cliente B',
      imagen_url: 'fake-path-b/dummy.jpg',
      estado: 'borrador',
    })
    .select('id').single();
  if (pErr) throw pErr;
  presupuestoB = p.id;

  const { data: l, error: lErr } = await admin
    .from('lineas_presupuesto')
    .insert({
      presupuesto_id: presupuestoB,
      nombre_modulo: 'Linea cross-tienda',
      tipo: 'bajo',
      medida: '60x72x60',
      unidades: 2,
      precio_unitario: 999.99,
      editado_manualmente: false,
      orden: 0,
    })
    .select('id').single();
  if (lErr) throw lErr;
  lineaB = l.id;

  console.log(`  tienda B      = ${tiendaB}`);
  console.log(`  presupuesto B = ${presupuestoB}`);
  console.log(`  linea B       = ${lineaB} (precio 999.99, uds 2)`);

  console.log('\n[setup] Creando presupuesto propio (tienda A) para sanity checks…');
  const { data: pa, error: paErr } = await admin
    .from('presupuestos')
    .insert({
      tienda_id: TIENDA_A,
      usuario_id: DEMO_USER_ID,
      cliente_nombre: 'Sanity RLS-Test',
      imagen_url: 'sanity-rls/dummy.jpg',
      estado: 'borrador',
    })
    .select('id').single();
  if (paErr) throw paErr;
  presupuestoPropio = pa.id;
  console.log(`  presupuesto propio (A) = ${presupuestoPropio}`);
}

async function testCrossTienda() {
  console.log('\n[test] Login como demo@kitchin.app (admin tienda A)…');
  const supa = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess, error: loginErr } = await supa.auth.signInWithPassword({
    email: DEMO_EMAIL, password: DEMO_PASS,
  });
  if (loginErr || !sess.user) throw new Error(`Login falló: ${loginErr?.message}`);

  console.log('\n[test] SELECT línea B (debería ser invisible)…');
  const { data: visibleB } = await supa
    .from('lineas_presupuesto').select('id').eq('id', lineaB);
  check('SELECT línea B devuelve 0 filas', (visibleB?.length ?? 0) === 0, `count=${visibleB?.length ?? 'null'}`);

  console.log('\n[test] SELECT global de lineas_presupuesto (solo tienda A)…');
  const { data: todasLineas } = await supa
    .from('lineas_presupuesto').select('id, presupuesto_id');
  const presupuestosVistos = new Set((todasLineas ?? []).map(r => r.presupuesto_id));
  check('SELECT global no incluye presupuesto B', !presupuestosVistos.has(presupuestoB),
    `presupuestos vistos: ${[...presupuestosVistos].length}`);

  console.log('\n[test] UPDATE línea B (debería afectar 0 filas)…');
  const { data: updRows, error: updErr } = await supa
    .from('lineas_presupuesto')
    .update({ precio_unitario: 1, unidades: 1 })
    .eq('id', lineaB)
    .select('id');
  check('UPDATE no devuelve error',     !updErr, updErr?.message ?? 'ok');
  check('UPDATE afecta 0 filas',        (updRows?.length ?? 0) === 0, `rows=${updRows?.length ?? 0}`);

  console.log('\n[test] DELETE línea B (debería afectar 0 filas)…');
  const { data: delRows, error: delErr } = await supa
    .from('lineas_presupuesto').delete().eq('id', lineaB).select('id');
  check('DELETE no devuelve error',     !delErr, delErr?.message ?? 'ok');
  check('DELETE afecta 0 filas',        (delRows?.length ?? 0) === 0, `rows=${delRows?.length ?? 0}`);

  console.log('\n[test] INSERT línea con presupuesto_id de B (debería rechazarse)…');
  const { data: insRow, error: insErr } = await supa
    .from('lineas_presupuesto')
    .insert({
      presupuesto_id: presupuestoB,
      nombre_modulo: 'Intento maligno',
      tipo: 'bajo',
      medida: 'X',
      unidades: 1,
      precio_unitario: 0,
      editado_manualmente: false,
      orden: 0,
    })
    .select('id');
  check('INSERT cross-tienda lanza error',
    Boolean(insErr) || !insRow || insRow.length === 0,
    insErr ? `error: ${insErr.code} ${insErr.message}` : `rows=${insRow?.length ?? 0}`);

  console.log('\n[test] RPC guardar_lineas_presupuesto(B, []) (debería rechazarse)…');
  const { data: rpcData, error: rpcErr } = await supa.rpc('guardar_lineas_presupuesto', {
    p_presupuesto_id: presupuestoB,
    p_lineas: [],
  });
  check('RPC cross-tienda devuelve error', Boolean(rpcErr),
    rpcErr ? `${rpcErr.code ?? ''} ${rpcErr.message}`.trim() : `data=${JSON.stringify(rpcData)}`);

  console.log('\n[test] Confirmación con service role: línea B intacta…');
  const { data: bAhora } = await admin
    .from('lineas_presupuesto')
    .select('precio_unitario, unidades').eq('id', lineaB).single();
  check('precio B sigue 999.99', Number(bAhora.precio_unitario) === 999.99, `valor=${bAhora.precio_unitario}`);
  check('unidades B sigue 2',     Number(bAhora.unidades) === 2,            `valor=${bAhora.unidades}`);

  console.log('\n[test] Sanity: el demo puede usar la RPC sobre SU presupuesto…');
  const { data: rpcOk, error: rpcOkErr } = await supa.rpc('guardar_lineas_presupuesto', {
    p_presupuesto_id: presupuestoPropio,
    p_lineas: [{
      nombre_modulo: 'Sanity 1', tipo: 'bajo', medida: '60x72x60',
      descripcion: '', unidades: 2, precio_unitario: 150, editado_manualmente: false,
    }],
  });
  check('RPC sobre presupuesto propio funciona', !rpcOkErr && rpcOk != null,
    rpcOkErr ? rpcOkErr.message : `total_bruto=${rpcOk?.total_bruto}`);

  if (rpcOk) {
    const { data: lineasPropias } = await admin
      .from('lineas_presupuesto')
      .select('nombre_modulo, precio_unitario, unidades, subtotal')
      .eq('presupuesto_id', presupuestoPropio);
    check('Sanity: la línea se persistió en BD', (lineasPropias?.length ?? 0) === 1,
      `count=${lineasPropias?.length}`);
    if (lineasPropias?.length === 1) {
      const l = lineasPropias[0];
      check('Sanity: subtotal calculado por BD (2 × 150 = 300)',
        Number(l.subtotal) === 300, `subtotal=${l.subtotal}`);
    }
  }

  await supa.auth.signOut();
}

async function cleanup() {
  console.log('\n[cleanup] Borrando datos de test…');
  if (tiendaB) {
    const { error } = await admin.from('tiendas').delete().eq('id', tiendaB);
    if (error) console.log('  ⚠️ tienda B:', error.message);
    else console.log('  tienda B + presupuesto + línea borrados (cascade)');
  }
  if (presupuestoPropio) {
    const { error } = await admin.from('presupuestos').delete().eq('id', presupuestoPropio);
    if (error) console.log('  ⚠️ presupuesto propio:', error.message);
    else console.log('  presupuesto propio borrado');
  }
}

try {
  await setup();
  await testCrossTienda();
} catch (err) {
  console.log('\nERROR no esperado:', err.message);
  fail++;
} finally {
  await cleanup();
  console.log(`\nResultado: ${pass} OK · ${fail} fallos`);
  process.exit(fail === 0 ? 0 : 1);
}
